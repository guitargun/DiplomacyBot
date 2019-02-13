﻿const { Client, RichEmbed } = require('discord.js');
var auth = require('./auth.json');
var request = require('request');
var parser = require('cheerio-tableparser');
var fs = require('fs');
const cheerio = require('cheerio');

var state = require('./state.json')[0];
var site = "https://webdiplomacy.net/";

var channel;
var siteContent;
var mapIndex = 0;

// Initialize Discord Bot
var client = new Client();

client.on('ready', function (evt) {
    console.log("Connected");

    channel = client.channels.find(ch => ch.name === "diplomacy");

    httpGet(function (response) {
        siteContent = response;

        const $ = cheerio.load(siteContent);

        //checking if the data is current
        if (state.Date.replace("-", ", ") !== $('span.gameDate').text()) {
            state.Date = $('span.gameDate').text().replace(", ", "-");
            channel.send("Date is now " + state.Date.replace("-", ", "));

            parser($);
            var members = $('.membersFullTable').parsetable(false, false, true);

            for (var i = 0; i < members[0].length; i++) {
                //some weird data is undefined
                if (members[1][i * 2] === undefined) {
                    break;
                }
                //getting the player data
                var country = members[0][i * 2];
                var data = members[1][i * 2].split(",");
                var name = data[0].split("(")[0].trim();
                var supply_centers = data[1].split(" ")[3];
                var units = data[2];

                var found = false;

                for (var p in state.Leaderboard) {
                    //updating player data
                    if (p.name === name) {
                        found = true;
                        if (p.supply_centers !== supply_centers) {
                            p.supply_centers = supply_centers;
                        }
                        if (p.units !== units) {
                            p.units = units;
                        }
                    }
                }
                if (!found) {
                    //adding new player data
                    let player = {
                        "name": name,
                        "country": country,
                        "supply_centers": supply_centers,
                        "units": units
                    }
                    state.Leaderboard.push(player);
                }

            }
            //saving the new data
            fs.writeFile('state.json', JSON.stringify([state], null, 2), 'utf8', function (err) {
                if (err) throw err;
            });
        }

    });
    console.log("loading complete");
});


//reacting on certain commands
client.on('message', message => {
    if (message.isMentioned(client.user.id)) {

        var args = message.content.split(" ");
        var cmd = args[1];
        args = args.slice(2, args.length - 1).join(" ");
        
        switch (cmd) {

            case 'ping':
                channel.send('pong');
                break;
            case 'leaderboard':
            case 'standing':
                leadboardCommandHandler(message);
                break;
            case 'map':
                mapCommandHandler(message);
                break;
            case 'help':
            default:
                helpCommandHandler(message);
                break;
        }
    }
});

//simple help handler
function helpCommandHandler(message) {
    const embed = new RichEmbed();
    embed.setTitle("Commands:");
    embed.addField("ping", "returns pong.. good for testing if the bot is dead.");
    embed.addField("leaderboard/standing", "returns the current standing. Able to sort on different things.");
    embed.addField("map", "Shows you the current map. Able to scroll through the different turns.");

    channel.send(embed);
}


//handles stuff for the leaderboard
function leadboardCommandHandler(message) {
    const embed = new RichEmbed();
    const filter = (reaction, user) => {
        return ['🚗','🏭','🇺🇳','🔤','❌'].includes(reaction.emoji.name) && user.id === message.author.id;
    };

    leaderBoardbuilder(embed, -1);
    channel.send(embed);

    //scrolling through map timeline
    channel.send(embed).then(async embedMessage => {
        await embedMessage.react('🚗');
        await embedMessage.react('🏭');
        await embedMessage.react('🇺🇳');
        await embedMessage.react('🔤');
        await embedMessage.react('❌');

        const collector = embedMessage.createReactionCollector(filter, { time: 180000 });

        collector.on('collect', (reaction, reactionCollector) => {
            const editEmbed = new RichEmbed();

            //scrolling correctly
            switch (reaction.emoji.name) {
                case '🚗':
                    break;
                case '🏭':
                    break;
                case '🇺🇳':
                    break;
                case '🔤':
                    break;
                case '❌':
                    break;
            }

            //completing edit
            editEmbed.setTitle(indexToDate());
            editEmbed.setImage(getMapSrc(mapIndex));
            embedMessage.edit(editEmbed);
        });
    });
}

//handles stuff for the map
function mapCommandHandler(message) {
    const embed = new RichEmbed();
    const filter = (reaction, user) => {
        return ['◀', '▶', '⏮', '⏭'].includes(reaction.emoji.name) && user.id === message.author.id;
    };



    embed.setImage(getMapSrc(-2));
    embed.setTitle("Map as of " + state.Date.replace("-", " "));

    //scrolling through map timeline
    channel.send(embed).then(async embedMessage => {
        await embedMessage.react('⏮');
        await embedMessage.react('◀');
        await embedMessage.react('▶');
        await embedMessage.react('⏭');

        const collector = embedMessage.createReactionCollector(filter, { time: 180000 });

        collector.on('collect', (reaction, reactionCollector) => {
            const editEmbed = new RichEmbed();

            //scrolling correctly
            switch (reaction.emoji.name) {
                case '◀':
                    if (mapIndex > -1) {
                        mapIndex--;
                    } else {
                        return;
                    }
                    break;
                case '▶':
                    if (mapIndex < getLatestMapIndex(-2)) {
                        mapIndex++;
                    } else {
                        return;
                    }
                    break;
                case '⏭':
                    mapIndex = getLatestMapIndex(-2);
                    break;
                case '⏮':
                    mapIndex = -1;
                    break;
            }

            //completing edit
            editEmbed.setTitle(indexToDate());
            editEmbed.setImage(getMapSrc(mapIndex));
            embedMessage.edit(editEmbed);
        });
    });
}

function getMapSrc(index) {
    mapIndex = getLatestMapIndex(index);
    return site + "map.php?gameID=" + state.GameID + "&turn=" + mapIndex;
}

function indexToDate() {
    var diff = Math.abs(mapIndex - getLatestMapIndex(-2));

    var season = state.Date.split("-")[0];
    var year = state.Date.split("-")[1];

    //switching the season correctly
    if (!(diff % 2 === 0)) {
        if (season === "Spring") {
            season = "Autum";
        } else {
            season = "Spring";
        }
    }
    //setting the year correctly
    year -= Math.ceil(diff / 2);
    return season + " " + year;
}

//gets a correct map index
function getLatestMapIndex(index) {
    if (index !== -2) return index;
    
    var season = state.Date.split("-")[0];
    var year = state.Date.split("-")[1];

    return (year - state.startYear) * 2 + (season === state.startSeason ? 0 : 1)-1;//returning the correct map index
}


function leaderBoardArrayMaker(sortType) {
    var array = [];
    var data = [];
    var sorted;
    switch (sortType) {
        //default
        case -1:
            for (const player in state.Leaderboard) {
                data = [];
                data.push(player.country, player.name, player.supply_centers, player.units);
                array.push(data);
            }
            break;
        //sorting by name
        case 0:
            sorted = state.Leaderboard.sort(function(a, b){
                return a.name - b.name;
            });
            for (const player in sorted) {
                data = [];
                data.push(player.country, player.name, player.supply_centers, player.units);
                array.push(data);
            }

            break;
        //sorting by amount supply_centers
        case 1:
            sorted = state.Leaderboard.sort(function (a, b) {
                return a.supply_centers - b.supply_centers;
            });
            for (const player in sorted) {
                data = [];
                data.push(player.country, player.name, player.supply_centers, player.units);
                array.push(data);
            }
            break;
        //sorting by amount units
        case 2:
            sorted = state.Leaderboard.sort(function (a, b) {
                return a.units - b.units;
            });
            for (const player in sorted) {
                data = [];
                data.push(player.country, player.name, player.supply_centers, player.units);
                array.push(data);
            }
            break;
    }

    return array;
}

function leaderBoardbuilder(embed, sortType) {
    for (var player in leaderBoardArrayMaker(sortType)) {
        embed.addField(
            "Country: " + player[0] + ", Played by: " + player[1],
            "Supply-Centers: " + player[2] + ", Units: " + player[3]
        );
    }
}


function httpGet(callback) {
    request(site + "board.php?gameID=" + state.GameID, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            callback(body);
        }
    });

}


client.login(auth.token);

