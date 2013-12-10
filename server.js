"use strict"
var fs = require("fs");
var http = require("http");
var connect = require("connect");
var gzip = require("connect-gzip");
var app = http.createServer(connect().use(gzip.staticGzip(__dirname)));
var io = require("socket.io").listen(app);
app.listen(13602);

var rooms = {};
var sockinfo = {};

function dropsock(data){
	if (this.id in sockinfo){
		var foe = sockinfo[this.id].foe;
		if (foe){
			foe.emit("foeleft");
		}
		delete sockinfo[this.id];
	}
}
function foeEcho(socket, event){
	socket.on(event, function(data){
		var foe = sockinfo[this.id].foe;
		if (foe && foe.id in sockinfo){
			foe.emit(event, data);
		}
	});
}

io.sockets.on("connection", function(socket) {
	sockinfo[socket.id] = {};
	socket.on("disconnect", dropsock);
	socket.on("reconnect_failed", dropsock);
	socket.on("pvpwant", function(data) {
		var pendinggame=rooms[data.room];
		console.log(this.id + ": " + (pendinggame?pendinggame.id:"-"));
		if (this == pendinggame){
			return;
		}
		sockinfo[this.id].deck = data.deck;
		if (pendinggame && pendinggame.id in sockinfo){
			var seed = Math.random()*4000000000;
			var first = seed<2000000000;
			sockinfo[this.id].foe = pendinggame;
			sockinfo[pendinggame.id].foe = this;
			this.emit("pvpgive", {first:first, seed:seed, deck:sockinfo[pendinggame.id].deck});
			pendinggame.emit("pvpgive", {first:!first, seed:seed, deck:data.deck});
			delete rooms[data.room]
		}else{
			rooms[data.room] = this;
		}
	});
	foeEcho(socket, "endturn");
	foeEcho(socket, "summon");
	foeEcho(socket, "active");
	foeEcho(socket, "chat");
});