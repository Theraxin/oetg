var Cards, CardCodes, Targeting, targetingMode, targetingModeCb, targetingText, game, discarding, animCb, user, renderer, endturnFunc, cancelFunc, accepthandfunc, foeDeck, player2summon, player2Card, guestname;
(function(g) {
	var htmlElements = ["leftpane", "chatArea", "chatinput", "deckimport", "aideck", "foename", "airefresh", "change", "login", "password", "challenge", "aievalopt", "chatBox", "trade", "bottompane"];
	for (var i = 0;i < htmlElements.length;i++) {
		g[htmlElements[i]] = document.getElementById(htmlElements[i]);
	}
})(window);
var etg = require("./etgutil");
var MersenneTwister = require("./MersenneTwister");
var myTurn = false;
var cardChosen = false;
loadcards(function(cards, cardcodes, targeting) {
	Cards = cards;
	CardCodes = cardcodes;
	Targeting = targeting;
	console.log("Cards loaded");
});
function getTarget(src, active, cb) {
	var targetingFilter = Targeting[active.activename];
	if (targetingFilter) {
		targetingMode = function(t) { return (t instanceof Player || t instanceof CardInstance || t.owner == game.turn || t.passives.cloak || !t.owner.isCloaked()) && targetingFilter(src, t); }
		targetingModeCb = cb;
		targetingText = active.activename;
	} else {
		cb();
	}
}
function maybeSetText(obj, text) {
	if (obj.text != text) obj.setText(text);
}
function maybeSetTexture(obj, text) {
	if (text) {
		obj.visible = true;
		obj.setTexture(text);
	} else obj.visible = false;
}
function maybeSetButton(oldbutton, newbutton) {
	if (oldbutton)
		oldbutton.visible = false;
	if (newbutton)
		newbutton.visible = true;
}
function reflectPos(obj) {
	var pos = obj instanceof PIXI.Point ? obj : obj.position;
	pos.set(900 - pos.x, 600 - pos.y);
}
function hitTest(obj, pos) {
	var x = obj.position.x - obj.width * obj.anchor.x, y = obj.position.y - obj.height * obj.anchor.y;
	return pos.x > x && pos.y > y && pos.x < x + obj.width && pos.y < y + obj.height;
}
function setInteractive() {
	for (var i = 0;i < arguments.length;i++) {
		arguments[i].interactive = true;
	}
}
function userEmit(x, data) {
	if (!data) data = {};
	data.u = user.name;
	data.a = user.auth;
	socket.emit(x, data);
}
function tgtToBits(x) {
	var bits;
	if (x == undefined) {
		return 0;
	} else if (x instanceof Player) {
		bits = 1;
	} else if (x instanceof Weapon) {
		bits = 17;
	} else if (x instanceof Shield) {
		bits = 33;
	} else {
		bits = (x instanceof Creature ? 2 : x instanceof Permanent ? 4 : 5) | x.getIndex() << 4;
	}
	if (x.owner == game.player2) {
		bits |= 8;
	}
	return bits;
}
function bitsToTgt(x) {
	var tgtop = x & 7, player = game.players[x & 8 ? 0 : 1];
	if (tgtop == 0) {
		return undefined;
	} else if (tgtop == 1) {
		return player[["owner", "weapon", "shield"][x >> 4]];
	} else if (tgtop == 2) {
		return player.creatures[x >> 4];
	} else if (tgtop == 4) {
		return player.permanents[x >> 4];
	} else if (tgtop == 5) {
		return player.hand[x >> 4];
	} else console.log("Unknown tgtop: " + tgtop + ", " + x);
}
function creaturePos(j, i) {
	var row = i < 8 ? 0 : i < 15 ? 1 : 2;
	var column = row == 2 ? (i+1) % 8 : i % 8;
	var p = new PIXI.Point( 151 + column * 79 + (row == 1 ? 79/2 : 0), 344 + row * 33);
	if (j) {
		reflectPos(p);
	}
	return p;
}
function permanentPos(j, i) {
	var p = new PIXI.Point(140 + (i % 8) * 64  , 504 + Math.floor(i / 8) * 40);
	if (j) {
		reflectPos(p);
	}
	return p;
}
function tgtToPos(t) {
	if (t instanceof Creature) {
		return creaturePos(t.owner == game.player2, t.getIndex());
	} else if (t instanceof Weapon) {
		var p = new PIXI.Point(666, 512);
		if (t.owner == game.player2) reflectPos(p);
		return p;
	} else if (t instanceof Shield) {
		var p = new PIXI.Point(710, 532);
		if (t.owner == game.player2) reflectPos(p);
		return p;
	} else if (t instanceof Permanent) {
		return permanentPos(t.owner == game.player2, t.getIndex());
	} else if (t instanceof Player) {
		var p = new PIXI.Point(50, 560);
		if (t == game.player2) reflectPos(p);
		return p;
	} else if (t instanceof CardInstance) {
		return new PIXI.Point(j ? 20 : 780, (j ? 140 : 300) + 20 * i);
	} else console.log("Unknown target");
}
function refreshRenderer() {
	if (renderer) {
		leftpane.removeChild(renderer.view);
	}
	renderer = new PIXI.CanvasRenderer(900, 600);
	leftpane.appendChild(renderer.view);
}

var mainStage, menuui, gameui;
var caimgcache = {}, crimgcache = {}, primgcache = {}, artcache = {}, artimagecache = {};
var elecols = [0xa99683, 0xaa5999, 0x777777, 0x996633, 0x5f4930, 0x50a005, 0xcc6611, 0x205080, 0xa9a9a9, 0x337ddd, 0xccaa22, 0x333333, 0x77bbdd];

function lighten(c) {
	return (c & 255) / 2 + 127 | ((c >> 8) & 255) / 2 + 127 << 8 | ((c >> 16) & 255) / 2 + 127 << 16;
}
function getIcon(ele) {
	return eicons ? eicons[ele] : nopic;
}
function getBack(ele, upped) {
	var offset = upped ? 13 : 0;
	return cardBacks ? cardBacks[ele + offset] : nopic;
}
function getRareIcon(rarity) {
	return rarityicons ? rarityicons[rarity] : nopic;
}
function makeArt(card, art) {
	var rend = new PIXI.RenderTexture(132, 256);
	var background = new PIXI.Sprite(getBack(card.element, card.upped));
	var rarity = new PIXI.Sprite(getRareIcon(card.rarity));
	var template = new PIXI.Graphics();
	background.position.set(0, 0);
	template.addChild(background);
	rarity.position.set(66, 241);
	template.addChild(rarity);
	if (art) {
		var artspr = new PIXI.Sprite(art);
		artspr.position.set(2, 20);
		template.addChild(artspr);
	}
	var nametag = new PIXI.Text(card.name, { font: "12px Dosis", fill: card.upped ? "black" : "white" });
	nametag.position.set(2, 4);
	template.addChild(nametag);
	if (card.cost) {
		var text = new PIXI.Text(card.cost, { font: "12px Dosis", fill: card.upped ? "black" : "white" });
		text.anchor.x = 1;
		text.position.set(rend.width - 20, 4);
		template.addChild(text);
		if (card.costele) {
			var eleicon = new PIXI.Sprite(getIcon(card.costele));
			eleicon.position.set(rend.width - 1, 10);
			eleicon.anchor.set(1, .5);
			eleicon.scale.set(.5, .5);
			template.addChild(eleicon);
		}
	}
	var words = card.info().split(" ");
	var x = 2, y = 150;
	for (var i = 0;i < words.length;i++) {
		var wordgfx = new PIXI.Sprite(getTextImage(words[i], 11, card.upped ? "black" : "white"));
		if (x + wordgfx.width > rend.width - 2) {
			x = 2;
			y += 12;
		}
		wordgfx.position.set(x, y);
		x += wordgfx.width + 3;
		template.addChild(wordgfx);
	}
	rend.render(template);
	return rend;
}
function getArt(code) {
	if (artcache[code]) return artcache[code];
	else {
		var loader = new PIXI.AssetLoader(["Cards/" + code + ".png"]);
		loader.onComplete = function() {
			var cardArt = PIXI.Texture.fromImage("Cards/" + code + ".png")
			artcache[code] = makeArt(CardCodes[code], cardArt);
			artimagecache[code] = cardArt;
		}
		artcache[code] = makeArt(CardCodes[code]);
		loader.load();
		return artcache[code];
	}
}
function getArtImage(code){
	if (artimagecache[code]) return artimagecache[code];
	else {
		var loader = new PIXI.AssetLoader(["Cards/" + code + ".png"]);
		loader.onComplete = function() {
			artimagecache[code] = PIXI.Texture.fromImage("Cards/" + code + ".png");
		}
		artimagecache[code] = null;
		loader.load();
		return artimagecache[code];
	}
}
function getCardImage(code) {
	if (caimgcache[code]) return caimgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(100, 20);
		var graphics = new PIXI.Graphics();
		graphics.lineStyle(2, 0x222222, 1);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : code == "0" ? 0x887766 : 0x111111);
		graphics.drawRect(0, 0, 100, 20);
		graphics.endFill();
		if (card) {
			var clipwidth = 2;
			if (card.cost) {
				var text = new PIXI.Text(card.cost, { font: "11px Dosis", fill: card.upped ? "black" : "white" });
				text.anchor.x = 1;
				text.position.set(rend.width - 20, 5);
				graphics.addChild(text);
				clipwidth += text.width + 22;
				if (card.costele) {
					var eleicon = new PIXI.Sprite(getIcon(card.costele));
					eleicon.position.set(rend.width - 1, 10);
					eleicon.anchor.set(1, .5);
					eleicon.scale.set(.5, .5);
					graphics.addChild(eleicon);
				}
			}
			var text, loopi = 0;
			do text = new PIXI.Text(card.name.substring(0, card.name.length - (loopi++)), { font: "11px Dosis", fill: card.upped ? "black" : "white" }); while (text.width > rend.width - clipwidth);
			text.position.set(2, 5);
			graphics.addChild(text);
		}
		rend.render(graphics);
		return eicons ? (caimgcache[code] = rend) : rend;
	}
}
//Yes, this code and the namings of the caches are starting to get weird...
var crimgartcache = {};
function getCreatureImage(code) {
	if (crimgcache[code] && crimgartcache[crimgcache[code]]) return crimgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(64, 82);
		var graphics = new PIXI.Graphics();
		var border = (new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]));
		border.scale.set(0.5, 0.5);
		graphics.addChild(border);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
		graphics.drawRect(0, 9, 64, 64);
		graphics.endFill();
		var art = getArtImage(code);
		if (art) {
			art = new PIXI.Sprite(art);
			art.scale.set(0.5, 0.5);
			art.position.set(0, 9);
			graphics.addChild(art);
		}
		if (card) {
			var boxGraphics = new PIXI.Graphics();
			boxGraphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
			boxGraphics.drawRect(0, 9, 17, 10);
			boxGraphics.endFill();
			graphics.addChild(boxGraphics);
			var text = new PIXI.Text(CardCodes[code].name, { font: "8px Dosis", fill: card.upped ? "black" : "white" });
			text.anchor.set(0.5, 0.5);
			text.position.set(33, 77);
			graphics.addChild(text);
		}
		rend.render(graphics);
		crimgcache[code] = rend;
		crimgartcache[rend] = art;
		return rend;
	}
}
var primgartcache = {};
function getPermanentImage(code) {
	if (primgcache[code] && primgartcache[primgcache[code]]) return primgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(64, 82);
		var graphics = new PIXI.Graphics();
		var border = (new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]));
		border.scale.set(0.5, 0.5);
		graphics.addChild(border);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
		graphics.drawRect(0, 9, 64, 64);
		graphics.endFill();
		var art = getArtImage(code);
		if (art) {
			art = new PIXI.Sprite(art);
			art.scale.set(0.5, 0.5);
			art.position.set(0, 9);
			graphics.addChild(art);
		}
		if (card) {
			var text = new PIXI.Text(CardCodes[code].name, { font: "8px Dosis", fill: card.upped ? "black" : "white" });
			text.anchor.set(0.5, 0.5);
			text.position.set(33, 77);
			graphics.addChild(text);
		}
		rend.render(graphics);
		primgcache[code] = rend;
		primgartcache[rend] = art;
		return rend;
	}
}
function getWeaponShieldImage(code) {
	if (primgcache[code] && primgartcache[primgcache[code]]) return primgcache[code];
	else {
		var card = CardCodes[code];
		var rend = new PIXI.RenderTexture(80, 102);
		var graphics = new PIXI.Graphics();
		var border = (new PIXI.Sprite(cardBorders[card.element + (card.upped ? 13 : 0)]));
		border.scale.set(5/8, 5/8);
		graphics.addChild(border);
		graphics.beginFill(card ? (card.upped ? lighten(elecols[card.element]) : elecols[card.element]) : elecols[0]);
		graphics.drawRect(0, 11, 80, 80);
		graphics.endFill();
		var art = getArtImage(code);
		if (art) {
			art = new PIXI.Sprite(art);
			art.scale.set(5/8, 5/8);
			art.position.set(0, 11);
			graphics.addChild(art);
		}
		if (card) {
			var text = new PIXI.Text(CardCodes[code].name, { font: "10px Dosis", fill: card.upped ? "black" : "white" });
			text.anchor.set(0.5, 0.5);
			text.position.set(40, 95);
			graphics.addChild(text);
		}
		rend.render(graphics);
		primgcache[code] = rend;
		primgartcache[rend] = art;
		return rend;
	}
}
function initTrade(data) {
	function isFreeCard(card) {
		return card.type == PillarEnum && !card.upped && !card.rarity;
	}
	player2Card = null;
	cardChosen = false;
	if (data.first) myTurn = true;
	var editorui = new PIXI.Stage(0x336699, true), tradeelement = 0;
	var btrade = new PIXI.Text("Trade", { font: "16px Dosis" });
	var bconfirm = new PIXI.Text("Confirm trade", { font: "16px Dosis" });
	var bconfirmed = new PIXI.Text("Confirmed!", { font: "16px Dosis" });
	var bcancel = new PIXI.Text("Cancel Trade", { font: "16px Dosis" });
	var editorcolumns = [];
	var selectedCard;
	var cardartcode;
	bcancel.position.set(10, 10);
	bcancel.click = function() {
		userEmit("canceltrade");
		startMenu();
	}
	btrade.position.set(100, 100);
	btrade.click = function() {
		if (myTurn) {
			if (selectedCard) {
				userEmit("cardchosen", { card: selectedCard })
				console.log("Card sent")
				myTurn = false;
				cardChosen = true;
				editorui.removeChild(btrade);
				editorui.addChild(bconfirm);
			}
			else
				chatArea.value = "You have to choose a card!"
		}
		else
			chatArea.value = "You need to wait for your friend to choose a card first";
	}
	bconfirm.position.set(100, 150);
	bconfirm.click = function() {
		if (player2Card) {
			console.log("Confirmed!");
			myTurn = false;
			userEmit("confirmtrade", { card: selectedCard, oppcard: player2Card });
			editorui.removeChild(bconfirm);
			editorui.addChild(bconfirmed);
		}
		else
			chatArea.value = "Wait for your friend to choose a card!"
	}
	bconfirmed.position.set(100, 180);
	setInteractive(btrade, bconfirm, bcancel);
	editorui.addChild(btrade);
	editorui.addChild(bcancel);


	var cardpool = {};
	for (var i = 0;i < user.pool.length;i++) {
		if (user.pool[i] in cardpool) {
			cardpool[user.pool[i]]++;
		} else {
			cardpool[user.pool[i]] = 1;
		}
	}

	var editoreleicons = [];
	for (var i = 0;i < 13;i++) {
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set(8, 184 + i * 32);
		setInteractive(sprite);
		(function(_i) {
			sprite.click = function() { tradeelement = _i; }
		})(i);
		editoreleicons.push(sprite);
		editorui.addChild(sprite);
	}
	function adjustRarity(card) {
		var rarity = card.rarity;
		if (card.upped) {
			if (rarity == 1)
				rarity = 2;
			else if (rarity == 3)
				rarity = 4;
			else
				rarity += 6
		}
		return rarity;
	}
	for (var i = 0;i < 6;i++) {
		editorcolumns.push([[], []]);
		for (var j = 0;j < 15;j++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + i * 130, 272 + j * 20);
			var sprcount = new PIXI.Text("", { font: "12px Dosis" });
			sprcount.position.set(102, 4);
			sprite.addChild(sprcount);
			(function(_i, _j) {
				sprite.click = function() {
					if (player2Card && adjustRarity(CardCodes[player2Card]) != adjustRarity(CardCodes[cardartcode])) chatArea.value = "You can only trade cards with the same rarity";
					else if (cardChosen) chatArea.value = "You have already selected a card";
					else if (!myTurn) chatArea.value = "You need to wait for your friend to choose a card first";
					else if (isFreeCard(CardCodes[cardartcode])) chatArea.value = "You can't trade a free card, that would just be cheating!";
					else selectedCard = cardartcode;
				}
				sprite.mouseover = function() {
					cardartcode = editorcolumns[_i][1][tradeelement][_j];
				}
			})(i, j);
			sprite.interactive = true;
			editorui.addChild(sprite);
			editorcolumns[i][0].push(sprite);
		}
		for (var j = 0;j < 13;j++) {
			editorcolumns[i][1].push(filtercards(i > 2,
                function(x) { return x.element == j && ((i % 3 == 0 && x.type == CreatureEnum) || (i % 3 == 1 && x.type <= PermanentEnum) || (i % 3 == 2 && x.type == SpellEnum)); },
                editorCardCmp));
		}
	}
	var cardArt = new PIXI.Sprite(nopic);
	cardArt.position.set(734, 8);
	editorui.addChild(cardArt);
	var selectedCardArt = new PIXI.Sprite(nopic);
	selectedCardArt.position.set(334, 8);
	editorui.addChild(selectedCardArt);
	var player2CardArt = new PIXI.Sprite(nopic);
	player2CardArt.position.set(534, 8);
	editorui.addChild(player2CardArt);
	animCb = function() {
		if (cardartcode) {
			cardArt.setTexture(getArt(cardartcode));
		}
		if (selectedCard) {
			selectedCardArt.setTexture(getArt(selectedCard));
		}
		if (player2Card) {
			player2CardArt.setTexture(getArt(player2Card));
		}
		for (var i = 0;i < 13;i++) {
			editoreleicons[i].setTexture(getIcon(i));
		}
		for (var i = 0;i < 6;i++) {
			for (var j = 0;j < editorcolumns[i][1][tradeelement].length;j++) {
				var spr = editorcolumns[i][0][j], code = editorcolumns[i][1][tradeelement][j], card = CardCodes[code];
				if (card in cardpool || isFreeCard(card)) spr.visible = true;
				else spr.visible = false;
				spr.setTexture(getCardImage(code));
				var txt = spr.getChildAt(0), card = CardCodes[code], inf = isFreeCard(card);
				if ((txt.visible = inf || code in cardpool)) {
					maybeSetText(txt, inf ? "-" : (cardpool[code].toString()));
				}
			}
			for (;j < 15;j++) {
				editorcolumns[i][0][j].visible = false;
			}
		}
	}
	mainStage = editorui;
	refreshRenderer();
}
function initGame(data, ai) {
	game = mkGame(data.first, data.seed);
	if (data.hp) {
		game.player2.maxhp = game.player2.hp = data.hp;
	}
	if (data.aimarkpower) {
		game.player2.markpower = data.aimarkpower;
	}
	var idx, code, decks = [data.urdeck, data.deck];
	for (var j = 0;j < 2;j++) {
		for (var i = 0;i < decks[j].length;i++) {
			if (CardCodes[code = decks[j][i]]) {
				game.players[j].deck.push(CardCodes[code]);
			} else if (~(idx = TrueMarks.indexOf(code))) {
				game.players[j].mark = idx;
			}
		}
	}
	foeDeck = game.player2.deck.slice();
	if (game.turn == game.player1) {
		game.player1.drawhand(7);
		game.player2.drawhand(7);
	} else {
		game.player2.drawhand(7);
		game.player1.drawhand(7);
	}
	if (data.foename) game.foename = data.foename;
	startMatch();
	if (ai) {
		game.player2.ai = ai;
		if (game.turn == game.player2) {
			progressMulligan(game);
		}
	}
}
function getDeck() {
	if (user) {
		return user.deck || [];
	}
	var deckstring = deckimport.value;
	return deckstring ? deckstring.split(" ") : [];
}
var aiDelay = 0;
function aiEvalFunc() {
	var gameBack = game;
	var disableEffectsBack = disableEffects;
	game = cloneGame(game);
	disableEffects = true;
	var self = game.player2;
	function mkcommand(cbits, tbits) {
		return ["cast", cbits | tbits << 9];
	}
	function iterLoop(n, commands, currentEval) {
		function iterCore(c, active) {
			var cbits = tgtToBits(c) ^ 8;
			var candidates = [fullCandidates[0]];
			function evalIter(t, ignoret) {
				if (ignoret || (t && targetingMode(t))) {
					var tbits = tgtToBits(t) ^ 8;
					var gameBack2 = game, targetingModeBack = targetingMode, targetingModeCbBack = targetingModeCb;
					game = cloneGame(game);
					var tone = bitsToTgt(tbits);
					bitsToTgt(cbits).useactive(tone);
					var cmdcopy = commands.slice();
					cmdcopy.push(mkcommand(cbits, tbits));
					var v = evalGameState(game);
					console.log(c + " " + t + " " + v);
					if (v < candidates[0]) {
						candidates = [v, cmdcopy];
					}
					if (n) {
						var iterRet = iterLoop(n - 1, cmdcopy, v);
						if (iterRet[0] < candidates[0]) {
							candidates = iterRet;
						}
					}
					game = gameBack2;
					targetingMode = targetingModeBack;
					targetingModeCb = targetingModeCbBack;
				}
			}
			getTarget(c, active || Actives.obsession, function(t) {
				if (!t) {
					evalIter(undefined, true);
				}
				targetingMode = null;
				console.log(candidates.length + candidates.join(" "));
				if (candidates.length > 1) {
					var v = candidates[0], oldv = fullCandidates[0];
					if (v < oldv) {
						fullCandidates = candidates;
					}
				}
			});
			if (targetingMode) {
				console.log("in " + active.activename);
				for (var j = 0;j < 2;j++) {
					var pl = j == 0 ? c.owner : c.owner.foe;
					console.log("1:" + (pl.game == game));
					evalIter(pl);
					console.log("2:" + (pl.game == game));
					evalIter(pl.weapon);
					evalIter(pl.shield);
					for (var i = 0;i < 23;i++) {
						evalIter(pl.creatures[i]);
					}
					console.log("3:" + (pl.game == game));
					for (var i = 0;i < 16;i++) {
						evalIter(pl.permanents[i]);
					}
					for (var i = 0;i < pl.hand.length;i++) {
						evalIter(pl.hand[i]);
					}
				}
				console.log("out");
				targetingModeCb(1);
			}
		}
		if (currentEval === undefined) {
			currentEval = evalGameState(game);
		}
		console.log("Currently " + currentEval);
		var fullCandidates = [currentEval];
		var self = game.player2;
		var wp = self.weapon, sh = self.shield;
		if (wp && wp.canactive()) {
			iterCore(wp, wp.active.cast);
		}
		if (sh && sh.canactive()) {
			iterCore(sh, sh.active.cast);
		}
		for (var i = 0;i < 23;i++) {
			var cr = self.creatures[i];
			if (cr && cr.canactive()) {
				iterCore(cr, cr.active.cast);
			}
		}
		for (var i = 0;i < 16;i++) {
			var pr = self.permanents[i];
			if (pr && pr.canactive()) {
				iterCore(pr, pr.active.cast);
			}
		}
		var codecache = {};
		for (var i = self.hand.length - 1;i >= 0;i--) {
			var cardinst = self.hand[i];
			if (cardinst.canactive()) {
				if (!(cardinst.card.code in codecache)) {
					codecache[cardinst.card.code] = true;
					iterCore(cardinst, cardinst.card.type == SpellEnum && cardinst.card.active);
				}
			}
		}
		return fullCandidates;
	}
	var cmd = iterLoop(1, [])[1];
	game = gameBack;
	disableEffects = disableEffectsBack;
	if (cmd) {
		return cmd[0];
	} else if (self.hand.length == 8) {
		var mincardvalue = 999, worstcards;
		for (var i = 0;i < 8;i++) {
			var cardinst = self.hand[i];
			var cardvalue = self.quanta[cardinst.card.element] - cardinst.card.cost;
			if (cardinst.card.type != SpellEnum && cardinst.card.active && cardinst.card.active.discard == Actives.obsession) { cardvalue += 5; }
			if (cardvalue == mincardvalue) {
				worstcards.push(i);
			} else if (cardvalue < mincardvalue) {
				mincardvalue = cardvalue;
				worstcards = [i];
			}
		}
		return ["endturn", worstcards[Math.floor(Math.random() * worstcards.length)]];
	} else return ["endturn"];
}

function aiFunc() {
	var self = this;
	function iterCore(c, active) {
		var cmd;
		getTarget(c, active, function(t) {
			targetingMode = null;
			if (!t && !ActivesEval[active.activename](c)) {
				console.log("Hold " + active.activename);
				return;
			}
			cmd = ["cast", (tgtToBits(c) ^ 8) | (tgtToBits(t) ^ 8) << 9];
		});
		if (targetingMode) {
			console.log("in " + active.activename);
			var t = evalPickTarget(c, active, targetingMode);
			console.log("out " + (t ? (t instanceof Player ? "player" : t.card.name) : ""));
			if (t) {
				targetingModeCb(t);
			} else targetingMode = null;
		}
		return cmd;
	}
	var cmd;
	for (var i = 0;i < 23;i++) {
		var cr = self.creatures[i];
		if (cr && cr.canactive()) {
			if (cmd = iterCore(cr, cr.active.cast)) return cmd;
		}
	}
	var wp = self.weapon, sh = self.shield;
	if (wp && wp.canactive()) {
		if (cmd = iterCore(wp, wp.active.cast)) return cmd;
	}
	if (sh && sh.canactive()) {
		if (cmd = iterCore(sh, sh.active.cast)) return cmd;
	}
	for (var i = self.hand.length - 1;i >= 0;i--) {
		var cardinst = self.hand[i];
		if (cardinst.canactive()) {
			if (cardinst.card.type == SpellEnum) {
				if (cmd = iterCore(cardinst, cardinst.card.active)) return cmd;
			} else if (cardinst.card.type == WeaponEnum ? (!self.weapon || self.weapon.card.cost < cardinst.card.cost) :
                cardinst.card.type == ShieldEnum ? (!self.shield || self.shield.card.cost < cardinst.card.cost) : true) {
				return ["cast", tgtToBits(cardinst) ^ 8];
			}
		}
	}
	for (var i = 0;i < 16;i++) {
		var pr = self.permanents[i];
		if (pr && pr.canactive()) {
			if (cmd = iterCore(pr, pr.active.cast)) return cmd;
		}
	}
	if (self.hand.length == 8) {
		var mincardvalue = 999, worstcards;
		for (var i = 0;i < 8;i++) {
			var cardinst = self.hand[i];
			var cardvalue = self.quanta[cardinst.card.element] - cardinst.card.cost;
			if (cardinst.card.type != SpellEnum && cardinst.card.active && cardinst.card.active.discard == Actives.obsession) { cardvalue += 5; }
			if (cardvalue == mincardvalue) {
				worstcards.push(i);
			} else if (cardvalue < mincardvalue) {
				mincardvalue = cardvalue;
				worstcards = [i];
			}
		}
		return ["endturn", worstcards[Math.floor(Math.random() * worstcards.length)]];
	} else return ["endturn"];
}
function victoryScreen(goldreward, cardreward) {
	victoryui = new PIXI.Stage(0x000000, true);

	//lobby background
	var bgvictory = new PIXI.Sprite(backgrounds[0]);
	victoryui.addChild(bgvictory);

	var victoryText = game.quest ? game.wintext : "You have won!";
	var posX = 450;
	var posY = game.cardreward ? 130 : 250;
	tinfo = makeText(posX, posY, victoryText, true);
	tinfo.anchor.x = 0.5;
	var bexit = makeButton(420, 430, 75, 18, buttons.exit);
	bexit.click = function() {
		if (game.cardreward) {
			userEmit("addcard", { c: game.cardreward });
			user.pool.push(game.cardreward);
		}
		if (game.goldreward) {
			userEmit("addgold", { g: game.goldreward });
			user.gold += game.goldreward;
		}
		if (game.quest)
			startQuestWindow();
		else
			startMenu();
		game = undefined;
	}
	if (game.goldreward) {
		var goldshown = game.cost ? (game.goldreward - game.cost) : game.goldreward;
		tgold = makeText(340, 550, "Gold won:      " + goldshown, true);
		var igold = PIXI.Sprite.fromImage("assets/gold.png");
		igold.position.set(420, 550);
		igold.visible = true;
		victoryui.addChild(tgold);
		victoryui.addChild(igold);
	}
	if (game.cardreward) {
		var cardArt = new PIXI.Sprite(getArt(game.cardreward));
		cardArt.position.set(380, 170);
		victoryui.addChild(cardArt);
	}
	victoryui.addChild(tinfo);
	victoryui.addChild(bexit);

	animCb = undefined;

	mainStage = victoryui;
	refreshRenderer();
}

function doubleDeck(deck) {
	return deck.slice(0, deck.length - 2).concat(deck);
}

function mkDemigod() {
	if (user) {
		if (user.gold < 20) {
			chatArea.value = "Requires 20\u00A4";
			return;
		}
		user.gold -= 20;
		userEmit("subgold", { g: 20 });
	}

	var demigodDeck = [
        "7ne 7ne 7ne 7ne 7n9 7n9 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t4 7t9 7t9 7t9 7tb 7tb 7ta 7ta 7ta 7td 7td 7td 7td 7t5 7t5 8pr",
        "7an 7an 7an 7an 7ap 7ap 7ap 7ap 7aj 7aj 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7gk 7h4 7h4 7h4 7h4 7h4 7gq 7gq 7gq 7h1 7h1 7h1 7gr 7gr 7gr 7gu 7gu 7gu 7gu 7gu 7gu 8pn",
        "744 744 744 744 744 744 744 744 744 744 744 744 744 744 744 74f 74f 74f 74f 74f 74f 745 745 745 745 745 7k9 7k9 7k9 7k9 7k9 7k9 7jv 7jv 7jv 7jv 7jv 7k7 7k7 7k7 7k1 8pq",
        "6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ts 6ve 6ve 6ve 6ve 6ve 6ve 6u2 6u2 6u2 6u2 6u2 6u2 6u1 6u1 6u1 6u1 6u1 6u1 6ud 6ud 6ud 6ud 6u7 6u7 6u7 6u7 7th 7th 7tj 7tj 7tj 7ta 7ta 8pt",
        "718 718 718 718 718 718 71a 71a 71a 71a 71a 7n2 7n2 7n2 7n2 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q0 7q4 7q4 7q4 7qf 7qf 7qf 7q5 7q5 7q5 7q5 7q5 7q5 7qg 7qg 7qg 7qg 8pk",
        "7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7bu 7bu 7bu 7bu 7bu 7bu 7ae 7ae 7ae 7ae 7ae 7ae 7al 7am 7am 7am 7as 7as 7as 7as 80d 80d 80d 80d 80i 80i 80i 8pu",
        "7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7ac 7bu 7bu 7bu 7bu 7bu 7am 7am 7am 7dm 7dm 7dn 7dn 7do 7do 7n0 7n6 7n6 7n6 7n6 7n3 7n3 7n3 7n3 7n3 7n3 7nb 7n9 7n9 7n9 8pr",
        "7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7dg 7e0 7e0 7e0 7e0 7e0 7e0 7dv 7dv 7dv 7dv 7dv 7dv 7n2 7n2 7n2 7n2 7qb 7qb 7qb 7th 7th 7th 7th 7tb 7tb 7tb 7tb 7tb 7tb 7ta 7ta 8pt",
        "710 710 710 710 710 710 710 710 710 710 710 710 710 710 72i 72i 72i 72i 71l 71l 71l 71l 717 717 717 71b 71b 71b 711 711 7t7 7t7 7t7 7t7 7t7 7t7 7t9 7t9 7t9 7ti 7ti 7ti 7ti 7ta 7ta 8pt",
        "778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 778 77g 77g 77g 77g 77g 77g 77q 77q 77h 77h 77h 77h 77h 77b 77b 77b 7q4 7q4 7q4 7ql 7ql 7ql 7ql 7ql 7q3 7q3 8ps"
	];

	var demigodNames = [
        "Atomsk",
        "Thetis",
        "Kenosis",
        "Lycaon",
        "Nirrti",
        "Suwako",
        "Akan",
        "Gobannus",
        "Anubis",
        "Pele"
	];

	var rand = Math.floor(Math.random() * demigodNames.length);
	var dgname = "Demigod\n" + demigodNames[rand];
	var deck = demigodDeck[rand].split(" ");
	deck = doubleDeck(deck);
	var urdeck = getDeck();
	if ((user && (!user.deck || user.deck.length < 31)) || urdeck.length < 11) {
		startEditor();
		return;
	}
	initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etg.MAX_INT, hp: 200, aimarkpower: 3, foename: dgname }, aievalopt.checked ? aiEvalFunc : aiFunc);
	game.cost = 20;
	game.gold = 30;
}
var questNecromancerDecks = ["52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52m 52m 52m 52m 52m 52m 52m 52m 52m 52m 52m 52m 531 531 531 531 52n 52n 52n 52n 717 717 8pk", "5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bs 5bu 5bu 5bu 5bu 5c1 5c1 5c1 5c1 5ca 5ca 8pp",
"52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52g 52m 52m 52m 52m 52m 52m 531 531 531 531 531 52l 52l 52l 52t 52t 52t 52t 52t 535 535 535 535 717 717 717 717 8pk"];
function mkQuestAi(quest, stage) {
	var deck;
	var foename = "";
	var markpower = 1;
	var hp = 100;
	var wintext = "";
	if (quest == "necromancer") {
		deck = questNecromancerDecks[stage].split(" ");
		if (stage == 0) {
			foename = "Skeleton Horde";
			hp = 80;
			markpower = 2;
			wintext = "You defeated the horde, but you should find out where they came from"
		}
		else if (stage == 1) {
			foename = "Forest Wildlife"
			hp = 60;
			wintext = "The creatures seemed very afraid of something, like there was something in the forest that did not belong there."
		}
		else if (stage = 2) {
			foename = "Evil Necromancer";
			hp = 120;
			markpower = 2;
			wintext = "You defeated the evil necromancer and stopped his undead from spreading through the land!"
		}
		else
			return;
	}
	else
		return;
	var urdeck = getDeck();
	if ((user && (!user.deck || user.deck.length < 31)) || urdeck.length < 11) {
		startEditor();
		return;
	}
	initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etg.MAX_INT, hp: hp, aimarkpower: markpower, foename: foename }, aievalopt.checked ? aiEvalFunc : aiFunc);
	game.quest = [quest, stage];
	game.wintext = wintext;
}
function mkAi(level) {
	return function() {
		var uprate = level == 1 ? 0 : (level == 2 ? .1 : .3);
		var gameprice = (level == 1 ? 0 : (level == 2 ? 5 : 10));
		function upCode(x) {
			return CardCodes[x].asUpped(Math.random() < uprate).code;
		}
		if (Cards) {
			var urdeck = getDeck();
			if ((user && (!user.deck || user.deck.length < 31)) || urdeck.length < 11) {
				startEditor();
				return;
			}
			var aideckstring = aideck.value, deck;
			if (!user && aideckstring) {
				deck = aideckstring.split(" ");
			} else {
				if (user) {
					if (user.gold < gameprice) {
						chatArea.value = "Requires " + gameprice + "\u00A4";
						return;
					}
					user.gold -= gameprice;
					userEmit("subgold", { g: gameprice });

				}
				var cardcount = {};
				var eles = [Math.ceil(Math.random() * 12), Math.ceil(Math.random() * 12)], ecost = [];
				var pillars = filtercards(false, function(x) { return x.type == PillarEnum && !x.rarity; });
				for (var i = 0;i < 13;i++) {
					ecost[i] = 0;
				}
				deck = [];
				var pl = PlayerRng;
				var anyshield = 0, anyweapon = 0;
				for (var j = 0;j < 2;j++) {
					for (var i = 0;i < (j == 0 ? 20 : 10) ;i++) {
						var maxRarity = level == 1 ? 2 : (level == 2 ? 3 : 4);
						var card = pl.randomcard(Math.random() < uprate, function(x) { return x.element == eles[j] && x.type != PillarEnum && x.rarity <= maxRarity && cardcount[x.code] != 6 && !(x.type == ShieldEnum && anyshield == 3) && !(x.type == WeaponEnum && anyweapon == 3); });
						deck.push(card.code);
						cardcount[card.code] = (cardcount[card.code] || 0) + 1;
						if (!(((card.type == WeaponEnum && !anyweapon) || (card.type == ShieldEnum && !anyshield)) && cardcount[card.code])) {
							ecost[card.costele] += card.cost;
						}
						if (card.cast) {
							ecost[card.castele] += card.cast * 1.5;
						}
						if (card == Cards.Nova || card == Cards.SuperNova) {
							for (var k = 1;k < 13;k++) {
								ecost[k]--;
							}
						} else if (card.type == ShieldEnum) anyshield++;
						else if (card.type == WeaponEnum) anyweapon++;
					}
				}
				if (!anyshield) {
					var card = CardCodes[deck[0]];
					ecost[card.costele] -= card.cost;
					deck[0] = Cards.Shield.asUpped(Math.random() < uprate).code;
				}
				if (!anyweapon) {
					var card = CardCodes[deck[1]];
					ecost[card.costele] -= card.cost;
					deck[1] = (eles[1] == Air ? Cards.ShortBow :
                        eles[1] == Gravity || eles[1] == Earth ? Cards.Hammer :
                        eles[1] == Water || eles[1] == Life ? Cards.Staff :
                        eles[1] == Darkness || eles[1] == Death ? Cards.Dagger :
                        Cards.ShortSword).asUpped(Math.random() < uprate).code;
				}
				var pillarstart = deck.length, qpe = 0, qpemin = 99;
				for (var i = 1;i < 13;i++) {
					if (!ecost[i]) continue;
					qpe++;
					qpemin = Math.min(qpemin, ecost[i]);
				}
				if (qpe >= 4) {
					for (var i = 0;i < qpemin * .8;i++) {
						deck.push(upCode(Cards.QuantumPillar.code));
						qpe++;
					}
				} else qpemin = 0;
				for (var i = 1;i < 13;i++) {
					if (!ecost[i]) continue;
					for (var j = 0;j < Math.round((ecost[i] - qpemin) / 5) ;j++) {
						deck.push(upCode(pillars[i * 2]));
					}
				}
				deck.push(TrueMarks[eles[1]]);
				chatArea.value = deck.join(" ");
			}

			var randomNames = [
                "Sherman",
                "Billie",
                "Monroe",
                "Brendon",
                "Murray",
                "Ronald",
                "Garland",
                "Emory",
                "Dane",
                "Rocky",
                "Stormy",
                "Audrie",
                "Page",
                "Martina",
                "Adrienne",
                "Yuriko",
                "Margie",
                "Tammi",
                "Digna",
                "Mariah",
                "Seth"
			];

			var typeName = [
                "Commoner",
                "Mage",
                "Champion"
			];

			var foename = typeName[level - 1] + "\n" + randomNames[Math.floor(Math.random() * randomNames.length)];

			initGame({ first: Math.random() < .5, deck: deck, urdeck: urdeck, seed: Math.random() * etg.MAX_INT, hp: level == 1 ? 100 : (level == 2 ? 125 : 150), aimarkpower: level == 3 ? 2 : 1, foename: foename }, aievalopt.checked ? aiEvalFunc : aiFunc);
			game.cost = gameprice;
			game.level = level;
			game.gold = level == 1 ? 5 : (level == 2 ? 10 : 20);
		}
	}
}

// Asset Loaders
var nopic = PIXI.Texture.fromImage("assets/null.png")
var imageLoadingNumber = 9;
var questIcons = [];
var questLoader = new PIXI.AssetLoader(["assets/questIcons.png"])
questLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/questIcons.png");
	for (var i = 0;i < 2;i++) {
		questIcons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 32, 0, 32, 32)));
	}
	maybeStartMenu();
}
questLoader.load();
var backgrounds = ["assets/bg_default.png", "assets/bg_lobby.png", "assets/bg_shop.png", "assets/bg_quest.png","assets/bg_game.png" ];
var bgLoader = new PIXI.AssetLoader(backgrounds);
bgLoader.onComplete = function() {
	var tmp = [];
	for (var i = 0;i < 5;i++) tmp.push(PIXI.Texture.fromImage(backgrounds[i]));
	backgrounds = tmp;
	maybeStartMenu();
}
bgLoader.load();

var eicons = [];
var eleLoader = new PIXI.AssetLoader(["assets/esheet.png"]);
eleLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/esheet.png");
	for (var i = 0;i < 13;i++) eicons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 32, 0, 32, 32)));
	maybeStartMenu();
}
eleLoader.load();

var cardBacks = [];
var backLoader = new PIXI.AssetLoader(["assets/backsheet.png"]);
backLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/backsheet.png");
	for (var i = 0;i < 26;i++) cardBacks.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 132, 0, 132, 256)));
	maybeStartMenu();
}
backLoader.load();

var cardBorders = []
var borderLoader = new PIXI.AssetLoader(["assets/cardborders.png"]);
borderLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/cardborders.png");
	for (var i = 0;i < 26;i++) cardBorders.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 128, 0, 128, 162)));
	maybeStartMenu();
}
borderLoader.load();

var rarityicons = [];
var rarityLoader = new PIXI.AssetLoader(["assets/raritysheet.png"]);
rarityLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/raritysheet.png");
	for (var i = 0;i < 6;i++) rarityicons.push(new PIXI.Texture(tex, new PIXI.Rectangle(i * 10, 0, 10, 10)));
	maybeStartMenu();
}
rarityLoader.load();

var buttonsList = [];
var buttonsClicked = [];
var buttonsMouseOver = [];
var buttons = {};
var buttonLoader = new PIXI.AssetLoader(["assets/buttons.png", "assets/buttons_mouseover.png", "assets/buttons_clicked.png"]);
buttonLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/buttons.png");
	var texClick = PIXI.Texture.fromImage("assets/buttons_clicked.png");
	var texOver = PIXI.Texture.fromImage("assets/buttons_mouseover.png");
	for (var i = 0;i < 7;i++) {
		for (var j = 0;j < 4;j++) {
			buttonsList.push(new PIXI.Texture(tex, new PIXI.Rectangle(j * 75 + 7, i * 28 + 19, 75, 25)));
			buttonsMouseOver.push(new PIXI.Texture(texOver, new PIXI.Rectangle(j * 75 + 7, i * 28 + 19, 75, 25)));
			buttonsClicked.push(new PIXI.Texture(texClick, new PIXI.Rectangle(j * 75 + 7, i * 28 + 19, 75, 25)));
		}
	}
	buttons = {
		logout: buttonsList[0],
		arenainfo: buttonsList[1],
		arenat10: buttonsList[2],
		arenaai: buttonsList[3],
		commoner: buttonsList[4],
		mage: buttonsList[5],
		champion: buttonsList[6],
		demigod: buttonsList[7],
		wipeaccount: buttonsList[8],
		editor: buttonsList[9],
		shop: buttonsList[10],
		exit: buttonsList[11],
		buypack: buttonsList[12],
		takecards: buttonsList[13],
		upgrade: buttonsList[14],
		quests: buttonsList[15],
		clear: buttonsList[16],
		done: buttonsList[17],
		import: buttonsList[18],
		resign: buttonsList[19],
		mulligan: buttonsList[20],
		endturn: buttonsList[21],
		cancel: buttonsList[22],
		accepthand: buttonsList[23],
		confirm: buttonsList[24],

	}
	maybeStartMenu();
}

function buttonArtClicked(button) {
	return buttonsClicked[buttonsList.indexOf(button)];
}
function buttonArtMouseover(button) {
	return buttonsMouseOver[buttonsList.indexOf(button)];
}
buttonLoader.load();

var boosters = [];
var boosterLoader = new PIXI.AssetLoader(["assets/boosters.png"]);
boosterLoader.onComplete = function() {
	var tex = PIXI.Texture.fromImage("assets/boosters.png");
	for (var i = 0;i < 2;i++)
		for (var j = 0;j < 4;j++)
			boosters.push(new PIXI.Texture(tex, new PIXI.Rectangle(j * 100, i * 150, 100, 150)));
	maybeStartMenu();
}
boosterLoader.load();

var popups = [];
var popupLoader = new PIXI.AssetLoader(["assets/popup_booster.png"]);
popupLoader.onComplete = function() {
	for (var i = 0;i < 1;i++) popups.push(PIXI.Texture.fromImage("assets/popup_booster.png"));
	maybeStartMenu();
}
popupLoader.load();

function makeButton(x, y, w, h, i, mouseoverfunc) {
	var b = new PIXI.Sprite(i);
	b.position.set(x, y);
	b.interactive = true;
	b.hitArea = new PIXI.Rectangle(0, 0, w, h);
	b.buttonMode = true;
	b.standardImage = i;
	if (~buttonsList.indexOf(i)) {
		b.mousedown = function() {
			b.setTexture(buttonArtClicked(b.standardImage));
		}
		b.mouseover = b.mouseup = function() {
			if (mouseoverfunc) mouseoverfunc();
			b.setTexture(buttonArtMouseover(b.standardImage));
		}
		b.mouseout = function() {
			b.setTexture(b.standardImage);
		}
	}

	return b;
}

function makeText(x, y, txt, vis) {
	var t = new PIXI.Text(txt, { font: "14px Verdana", fill: "white", stroke: "black", strokeThickness: 2 });
	t.position.set(x, y);
	t.visible = vis;

	return t;
}

function toggleB() {
	for (var i = 0;i < arguments.length;i++) {
		arguments[i].visible = !arguments[i].visible;
		arguments[i].interactive = !arguments[i].interactive;
		arguments[i].buttonMode = !arguments[i].buttonMode;
	}
}
function maybeStartMenu() {
	imageLoadingNumber--;
	console.log(imageLoadingNumber);
	if (imageLoadingNumber == 0) {
		startMenu();
		requestAnimate();
	}
}
function startMenu() {
	menuui = new PIXI.Stage(0x000000, true);
	var buttonList = [];
	var mouseroverButton;
	var clickedButton;
	//lobby background
	var bglobby = new PIXI.Sprite(backgrounds[1]);
	bglobby.interactive = true;
	bglobby.hitArea = new PIXI.Rectangle(0, 0, 900, 670);
	bglobby.mouseover = function() {
		tinfo.setText("");
		tcost.setText("");
		igold2.visible = false;
	}
	menuui.addChild(bglobby);

	//gold text
	var tgold = makeText(755, 101, (user ? user.gold : "Sandbox"), true);
	menuui.addChild(tgold);

	//info text
	var tinfo = makeText(50, 26, "", true)
	menuui.addChild(tinfo);

	//cost text
	var tcost = makeText(50, 51, "", true);
	menuui.addChild(tcost);

	//gold icons
	var igold = PIXI.Sprite.fromImage("assets/gold.png");
	igold.position.set(750, 100);
	igold.visible = false;
	menuui.addChild(igold);

	var igold2 = PIXI.Sprite.fromImage("assets/gold.png");
	igold2.position.set(95, 50);
	igold2.visible = false;
	menuui.addChild(igold2);

	//ai0 button
	var bai0 = makeButton(50, 100, 75, 25, buttons.commoner, function() {
		tinfo.setText("Commoners have no upgraded cards.");
		tcost.setText("Cost:     0");
		igold2.visible = true;
	});
	bai0.click = mkAi(1);
	menuui.addChild(bai0);

	//ai1 button
	var bai1 = makeButton(150, 100, 75, 25, buttons.mage, function() {
		tinfo.setText("Mages have a few upgraded cards.");
		tcost.setText("Cost:     5");
		igold2.visible = true;
	});
	bai1.click = mkAi(2);
	menuui.addChild(bai1);

	//ai2 button
	var bai2 = makeButton(250, 100, 75, 25, buttons.champion, function() {
		tinfo.setText("Champions have some upgraded cards.");
		tcost.setText("Cost:     10");
		igold2.visible = true;
	});
	bai2.click = mkAi(3);
	menuui.addChild(bai2);

	//ai3 button
	var bai3 = makeButton(350, 100, 75, 25, buttons.demigod, function() {
		tinfo.setText("Demigods are extremely powerful. Come prepared for anything.");
		tcost.setText("Cost:     20");
		igold2.visible = true;
	});
	bai3.click = mkDemigod;
	menuui.addChild(bai3);

	//Quests button
	var bquest = makeButton(50, 145, 75, 25, buttons.quests, function() {
		tinfo.setText("Go on adventure!");
	});
	bquest.click = startQuestWindow;
	menuui.addChild(bquest);

	//ai arena button
	var baia = makeButton(50, 200, 75, 25, buttons.arenaai, function() {
		tinfo.setText("In the arena you will face decks from other players.");
		tcost.setText("Cost:     10");
		igold2.visible = true;
	});
	baia.click = function() {
		if (Cards) {
			if (!user.deck || user.deck.length < 31) {
				startEditor();
				return;
			}

			if (user.gold < 10) {
				chatArea.value = "Requires 10g";
				return;
			}

			user.gold -= 10;
			userEmit("subgold", { g: 10 });
			userEmit("foearena");
		}
	}
	menuui.addChild(baia);

	//arena info button
	var binfoa = makeButton(50, 245, 75, 25, buttons.arenainfo, function() {
		tinfo.setText("Check how your arena deck is doing.")
		tcost.setText("");
	});
	binfoa.click = function() {
		if (Cards) {
			userEmit("arenainfo");
		}
	}
	menuui.addChild(binfoa);

	//arena top10 button
	var btopa = makeButton(150, 245, 75, 25, buttons.arenat10, function() {
		tinfo.setText("Here you can see who the top players in arena are right now.")
		tcost.setText("");
	});
	btopa.click = function() {
		if (Cards) {
			userEmit("arenatop");
		}
	}
	menuui.addChild(btopa);

	//edit button
	var bedit = makeButton(50, 300, 75, 25, buttons.editor, function() {
		tinfo.setText("Here you can edit your deck, as well as submit an arena deck.");
		tcost.setText("");
	});
	bedit.click = startEditor;
	menuui.addChild(bedit);

	var bshop = makeButton(150, 300, 75, 25, buttons.shop, function() {
		tinfo.setText("Here you can buy booster packs which contains cards from the elements you choose.");
		tcost.setText("");
	});
	bshop.click = startStore;
	menuui.addChild(bshop);

	//upgrade button
	var bupgrade = makeButton(250, 300, 75, 18, buttons.upgrade, function() {
		tinfo.setText("Here you can upgrade cards as well as buy upgraded Pillars");
		tcost.setText("");
	});
	bupgrade.click = upgradestore;
	menuui.addChild(bupgrade);

	//logout button
	var blogout = makeButton(750, 246, 75, 25, buttons.logout, function() {
		tinfo.setText("Click here if you want to log out.")
		tcost.setText("");
	});
	blogout.click = function() {
		userEmit("logout");
		logout();

	}
	menuui.addChild(blogout);

	//delete account button
	var bdelete = makeButton(750, 550, 75, 25, buttons.wipeaccount, function() {
		tinfo.setText("Click here if you want to remove your account.")
		tcost.setText("");
	});
	bdelete.click = function() {
		if (foename.value == user.name) {
			userEmit("delete");
			logout();
		} else {
			chatArea.value = "Input '" + user.name + "' into Challenge to delete your account";
		}
	}
	menuui.addChild(bdelete);

	if (!user) toggleB(baia, bshop, bupgrade, binfoa, btopa, blogout, bdelete, bquest);

	//only display if user is logged in
	if (user) {
		tgold.position.set(770, 101);
		igold.visible = true;

		if (user.oracle) {
			// todo user.oracle should be a card, not true. The card is the card that the server itself added. This'll only show what was added
			delete user.oracle;
			var card = PlayerRng.randomcard(false,
                (function(y) { return function(x) { return x.type != PillarEnum && ((x.rarity != 5) ^ y); } })(Math.random() < .03)).code;
			userEmit("addcard", { c: card, o: card });
			user.ocard = card;
			user.pool.push(card);
			var oracle = new PIXI.Sprite(nopic);
			oracle.position.set(450, 100);
			menuui.addChild(oracle);
		}
	}

	function logout() {
		user = undefined;

		toggleB(baia, bshop, bupgrade, binfoa, btopa, blogout, bdelete, bquest);

		tgold.setText("Sandbox");
		tgold.position.set(755, 101);
		igold.visible = false;

		if (oracle) {
			menuui.removeChild(oracle);
		}
	}

	animCb = function() {
		if (user && oracle) {
			oracle.setTexture(getArt(card));
		}
	}

	mainStage = menuui;
	refreshRenderer();
}
function startQuest(questname) {
	if (!user.quest[questname] && user.quest[questname] != 0) {
		user.quest[questname] = 0;
		userEmit("updatequest", { quest: questname, newstage: 0 });
	}
}
function startQuestWindow() {
	//Start the first quest
	startQuest("necromancer");

	var questui = new PIXI.Stage(0x454545, true);
	var bgquest = new PIXI.Sprite(backgrounds[3]);
	bgquest.interactive = true;
	bgquest.hitArea = new PIXI.Rectangle(0, 0, 900, 670);
	bgquest.mouseover = function() {
		tinfo.setText("");
	}
	questui.addChild(bgquest);
	var tinfo = makeText(50, 26, "", true)
	var quest1Buttons = [];
	function makeQuestButton(quest, stage, text, pos) {
		var button = makeButton(pos[0], pos[1], 64, 64, user.quest[quest] > stage ? questIcons[1] : questIcons[0]);
		button.mouseover = function() {
			tinfo.setText(text);
		}
		button.click = function() {
			mkQuestAi(quest, stage);
		}
		return button;
	}
	var necromancerTexts = ["A horde of skeletons have been seen nearby, perhaps you should go investigate?", "They seemed to come from the forest, so you go inside.", "Deep inside the forest you find the necromancer responsible for filling the lands with undead!"];
	var necromancerPos = [[200, 200], [200, 250], [225, 300]];
	if (user.quest.necromancer || user.quest.necromancer == 0) {
		for (var i = 0;i <= user.quest.necromancer;i++) {
			if (necromancerTexts[i]) {
				var button = makeQuestButton("necromancer", i, necromancerTexts[i], necromancerPos[i]);
				questui.addChild(button);
			}
		}
	}
	var bexit = makeButton(750, 246, 75, 18, buttons.exit);
	bexit.click = function() {
		startMenu();
	}
	questui.addChild(tinfo);
	questui.addChild(bexit);
	animCb = undefined;
	mainStage = questui;
	refreshRenderer();
}
function editorCardCmp(x, y) {
	var cardx = CardCodes[x], cardy = CardCodes[y];
	return cardx.upped - cardy.upped || cardx.element - cardy.element || cardx.cost - cardy.cost || (x > y) - (x < y);
}

function upgradestore() {
	function isFreeCard(card) {
		return card.type == PillarEnum && !card.upped && !card.rarity;
	}
	function upgradeCard(card) {
		if (!card.upped) {
			if (!isFreeCard(card)) {
				if (cardpool[card.code] >= 6) {
					userEmit("upgrade", { card: card.code, newcard: card.asUpped(true).code });
					for (var i = 0;i < 6;i++) {
						user.pool.splice(user.pool.indexOf(card.code), 1);
					}
					user.pool.push(card.asUpped(true).code);
					adjustdeck();
				}
				else twarning.setText("You need at least 6 copies to be able to upgrade this card!");
			}
			else {
				if (user.gold >= 50) {
					user.gold -= 50;
					userEmit("subgold", { g: 50 });
					userEmit("addcard", { c: card.asUpped(true).code });
					user.pool.push(card.asUpped(true).code);
					adjustdeck();
				}
				else twarning.setText("You need at least 50 gold to be able to upgrade a pillar!");
			}
		}
		else twarning.setText("You can't upgrade an already upgraded card!");
	}
	function adjustdeck() {
		cardpool = {};
		for (var i = 0;i < user.pool.length;i++) {
			if (user.pool[i] in cardpool) {
				cardpool[user.pool[i]]++;
			} else {
				cardpool[user.pool[i]] = 1;
			}
		}
	}
	var upgradeui = new PIXI.Stage(0x336699, true);
	var bg = new PIXI.Sprite(backgrounds[0]);
	upgradeui.addChild(bg);

	var goldcount = new PIXI.Text(user.gold + "g", { font: "bold 16px Dosis" });
	goldcount.position.set(30, 100);
	upgradeui.addChild(goldcount);
	var bupgrade = makeButton(150, 100, 75, 18, buttons.upgrade);
	bupgrade.click = function() {
		upgradeCard(CardCodes[selectedCard]);
	};
	upgradeui.addChild(bupgrade);
	var bexit = makeButton(50, 50, 75, 18, buttons.exit);
	bexit.click = function() {
		startMenu();
	};
	upgradeui.addChild(bexit);
	var tinfo = new PIXI.Text("", { font: "bold 16px Dosis" });
	tinfo.position.set(130, 120);
	upgradeui.addChild(tinfo);
	var twarning = new PIXI.Text("", { font: "bold 16px Dosis" });
	twarning.position.set(100, 70);
	upgradeui.addChild(twarning);

	var editorcolumns = [];
	var selectedCard;
	var cardartcode;
	var cardpool = {};
	var chosenelement = 0;
	adjustdeck();

	var editoreleicons = [];
	for (var i = 0;i < 13;i++) {
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set(8, 184 + i * 32);
		setInteractive(sprite);
		(function(_i) {
			sprite.click = function() { chosenelement = _i; }
		})(i);
		editoreleicons.push(sprite);
		upgradeui.addChild(sprite);
	}
	for (var i = 0;i < 6;i++) {
		editorcolumns.push([[], []]);
		for (var j = 0;j < 15;j++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + i * 130, 272 + j * 20);
			var sprcount = new PIXI.Text("", { font: "12px Dosis" });
			sprcount.position.set(102, 4);
			sprite.addChild(sprcount);
			(function(_i, _j) {
				sprite.click = function() {
					selectedCard = cardartcode;
					if (isFreeCard(CardCodes[cardartcode]))
						tinfo.setText("Costs 50 gold to upgrade");
					else tinfo.setText("Convert 6 of these into an upgraded version.");
					twarning.setText("");
				}
				sprite.mouseover = function() {
					cardartcode = editorcolumns[_i][1][chosenelement][_j];
				}
			})(i, j);
			sprite.interactive = true;
			upgradeui.addChild(sprite);
			editorcolumns[i][0].push(sprite);
		}
		for (var j = 0;j < 13;j++) {
			editorcolumns[i][1].push(filtercards(i > 2,
                function(x) { return x.element == j && ((i % 3 == 0 && x.type == CreatureEnum) || (i % 3 == 1 && x.type <= PermanentEnum) || (i % 3 == 2 && x.type == SpellEnum)); },
                editorCardCmp));
		}
	}
	var cardArt = new PIXI.Sprite(nopic);
	cardArt.position.set(734, 8);
	upgradeui.addChild(cardArt);
	var selectedCardArt = new PIXI.Sprite(nopic);
	selectedCardArt.position.set(534, 8);
	upgradeui.addChild(selectedCardArt);
	animCb = function() {
		if (cardartcode) {
			cardArt.setTexture(getArt(cardartcode));
		}
		if (selectedCard) {
			selectedCardArt.setTexture(getArt(selectedCard));
		}
		for (var i = 0;i < 13;i++) {
			editoreleicons[i].setTexture(getIcon(i));
		}
		for (var i = 0;i < 6;i++) {
			for (var j = 0;j < editorcolumns[i][1][chosenelement].length;j++) {
				var spr = editorcolumns[i][0][j], code = editorcolumns[i][1][chosenelement][j], card = CardCodes[code];
				if (card in cardpool || isFreeCard(card)) spr.visible = true;
				else spr.visible = false;
				spr.setTexture(getCardImage(code));
				var txt = spr.getChildAt(0), card = CardCodes[code], inf = isFreeCard(card);
				if ((txt.visible = inf || code in cardpool)) {
					maybeSetText(txt, inf ? "-" : (cardpool[code].toString()));
				}
			}
			for (;j < 15;j++) {
				editorcolumns[i][0][j].visible = false;
			}
		}
		goldcount.setText(user.gold + "g");
	}
	mainStage = upgradeui;
	refreshRenderer();
}

function startStore() {
	var cardartcode;
	var packtype = 0;
	var packrarity = 0;
	var cardamount = 0;
	var cost = 0;
	var newCards = [];
	var newCardsArt = [];

	var storeui = new PIXI.Stage(0x000000, true);

	//shop background
	var bgshop = new PIXI.Sprite(backgrounds[2]);
	storeui.addChild(bgshop);

	//gold text
	var tgold = makeText(770, 101, user.gold, true);
	storeui.addChild(tgold);

	//info text
	var tinfo = makeText(50, 26, "Select which elements you want.", true);
	storeui.addChild(tinfo);

	var tinfo2 = makeText(50, 51, "Select which type of booster you want.", true);
	storeui.addChild(tinfo2);

	//gold icon
	var igold = PIXI.Sprite.fromImage("assets/gold.png");
	igold.position.set(750, 100);
	storeui.addChild(igold);

	//get cards button
	var bget = makeButton(750, 156, 75, 18, buttons.takecards);
	toggleB(bget);
	bget.click = function() {
		userEmit("add", { add: etg.encodedeck(newCards) });
		for (var i = 0;i < 10;i++) {
			user.pool.push(newCards[i]);
			newCardsArt[i].visible = false;
		}

		toggleB(bbronze, bsilver, bgold, bplatinum, bget, bbuy);
		popbooster.visible = false;
		newCards = [];
	}
	storeui.addChild(bget);

	//exit button
	var bexit = makeButton(750, 246, 75, 18, buttons.exit);
	bexit.click = function() {
		if (isEmpty(newCards)) {
			startMenu();
		} else {
			tinfo.setText("Get your cards before leaving!");
			tinfo2.setText("");
		}
	}
	storeui.addChild(bexit);

	//buy button
	var bbuy = makeButton(750, 156, 75, 18, buttons.buypack);
	bbuy.click = function() {
		if (isEmpty(newCards)) {
			if (user.gold >= cost) {
				var allowedElements = []
				if (!packrarity || !packtype) {
					tinfo.setText("Select a pack first!");
					tinfo2.setText("");
					return;
				}


				user.gold -= cost;
				userEmit("subgold", { g: cost });

				for (var i = 0;i < cardamount;i++) {
					var rarity = 1;
					if ((packrarity == 2 && i >= 3) || (packrarity == 3 && i >= 3) || (packrarity == 4 && i>=4))
						rarity = 2;
					if ((packrarity == 3 && i >= 7) || (packrarity == 4 && i >= 7))
						rarity = 3;
					if (packrarity == 4 && i >= 8)
						rarity = 4;
					var fromElement = Math.random() < .4 ? false : true;
					newCards.push(PlayerRng.randomcard(false, function(x) { return (x.element == packtype) ^ fromElement && x.type != PillarEnum && x.rarity == rarity }).code);
					newCardsArt[i].setTexture(getArt(newCards[i]));
					newCardsArt[i].visible = true;
				}

				toggleB(bbronze, bsilver, bgold, bplatinum, bget, bbuy);
				popbooster.visible = true;
			} else {
				tinfo.setText("You can't afford that!");
				tinfo2.setText("");
			}
		} else {
			tinfo.setText("Take your cards before you buy more!");
			tinfo2.setText("");
		}
	}
	storeui.addChild(bbuy);

	
	// The different pack types
	var bbronze = makeButton(50, 280, 100, 200, boosters[4]);
	bbronze.click = function() {
		packrarity = 1;
		tinfo2.setText("Bronze Pack: 9x Common");
		cardamount = 9;
		cost = 15;
	}
	storeui.addChild(bbronze);

	var bsilver = makeButton(175, 280, 100, 200, boosters[5]);
	bsilver.click = function() {
		packrarity = 2;
		tinfo2.setText("Silver Pack: 3x Common + 3x Uncommon");
		cardamount = 6;
		cost = 25
	}
	storeui.addChild(bsilver);

	var bgold = makeButton(300, 280, 100, 200, boosters[6]);
	bgold.click = function() {
		packrarity = 3;
		tinfo2.setText("Gold Pack: 3x Common + 4x Uncommon + 1x Rare");
		cardamount = 8;
		cost = 65;
	}
	storeui.addChild(bgold);

	var bplatinum = makeButton(425, 280, 100, 200, boosters[7]);
	bplatinum.click = function() {
		packrarity = 4;
		tinfo2.setText("Platinum Pack: 4x Common + 3x Uncommon + 1x Rare + 1x Shard");
		cardamount = 9;
		cost = 100;
	}
	storeui.addChild(bplatinum);

	for (var i = 1;i < 13;i++) {
		var elementbutton = makeButton(75 + Math.floor((i-1) / 2)*75, 120 + ((i-1) % 2)*75, 32, 32, eicons[i]);
		(function(_i) {
			elementbutton.click = function() {
				packtype = _i;
				tinfo.setText("Selected Element: " + descr[_i]);
			}
		})(i);
		storeui.addChild(elementbutton);
	}

	//booster popup
	var popbooster = new PIXI.Sprite(popups[0]);
	popbooster.position.set(43, 93);
	popbooster.visible = false;
	storeui.addChild(popbooster);

	//draw cards that are pulled from a pack
	for (var i = 0;i < 2;i++) {
		for (var j = 0;j < 5;j++) {
			var cardArt = new PIXI.Sprite(nopic);
			cardArt.scale = new PIXI.Point(0.85, 0.85)
			cardArt.position.set(50 + (j * 125), 100 + (i * 225));
			storeui.addChild(cardArt);

			newCardsArt.push(cardArt);
		}
	}

	//update loop
	animCb = function() {
		for (var i = 0;i < 10;i++) {
			if (newCards[i]) newCardsArt[i].setTexture(getArt(newCards[i]));
		}

		tgold.setText(user.gold);
	}

	mainStage = storeui;
	refreshRenderer();
}

function startEditor() {
	function adjustCardMinus(code, x) {
		if (code in cardminus) {
			cardminus[code] += x;
		} else cardminus[code] = x;
	}
	function isFreeCard(card) {
		return card.type == PillarEnum && !card.upped && !card.rarity;
	}
	function processDeck() {
		for (var i = editordeck.length - 1;i >= 0;i--) {
			if (!(editordeck[i] in CardCodes)) {
				var index = TrueMarks.indexOf(editordeck[i]);
				if (index >= 0) {
					editormark = index;
				}
				editordeck.splice(i, 1);
			}
		}
		editordeck.sort(editorCardCmp);
		if (usePool) {
			cardminus = {};
			cardpool = {};
			for (var i = 0;i < user.pool.length;i++) {
				if (user.pool[i] in cardpool) {
					cardpool[user.pool[i]]++;
				} else {
					cardpool[user.pool[i]] = 1;
				}
			}
			if (user.starter) {
				for (var i = 0;i < user.starter.length;i++) {
					if (user.starter[i] in cardpool) {
						cardpool[user.starter[i]]++;
					} else {
						cardpool[user.starter[i]] = 1;
					}
				}
			}
			for (var i = editordeck.length - 1;i >= 0;i--) {
				var code = editordeck[i];
				if (CardCodes[code].type != PillarEnum) {
					var card = CardCodes[code];
					if ((cardminus[card.asUpped(false).code] || 0) + (cardminus[card.asUpped(true).code] || 0) == 6) {
						editordeck.splice(i, 1);
						continue;
					}
				}
				if (!isFreeCard(CardCodes[code])) {
					if ((cardminus[code] || 0) < (cardpool[code] || 0)) {
						adjustCardMinus(code, 1);
					} else {
						editordeck.splice(i, 1);
					}
				}
			}
		}
	}
	if (Cards && (!user || user.deck)) {
		var usePool = !!(user && (user.deck || user.starter));
		var cardminus, cardpool, cardartcode;
		chatArea.value = "Build a 30-60 card deck";
		var editorui = new PIXI.Stage(0x336699, true), editorelement = 0;
		var bg = new PIXI.Sprite(backgrounds[0]);
		editorui.addChild(bg);
		var bclear = makeButton(8, 8, 75, 18, buttons.clear);
		var bsave = makeButton(8, 32, 75, 18, buttons.done);
		var bimport = makeButton(8, 56, 75, 18, buttons.import);
		var barena = makeButton(8, 152, 75, 18, buttons.arenaai, function() {
			if (user && user.ocard) {
				chatArea.value = "Oracle Card: " + CardCodes[user.ocard].name;
			}
		});
		bclear.click = function() {
			if (usePool) {
				cardminus = {};
			}
			editordeck.length = 0;
		}
		bsave.click = function() {
			editordeck.push(TrueMarks[editormark]);
			deckimport.value = editordeck.join(" ");
			if (usePool) {
				userEmit("setdeck", { d: etg.encodedeck(editordeck) });
				user.deck = editordeck;
			}
			startMenu();
		}
		bimport.click = function() {
			editordeck = deckimport.value.split(" ");
			processDeck();
		}
		barena.click = function() {
			if (editordeck.length < 30) {
				chatArea.value = "30 cards required before submission";
				return;
			}
			if (usePool) {
				editordeck.push(TrueMarks[editormark]);
				userEmit("setarena", { d: etg.encodedeck(editordeck) });
				editordeck.pop();
				chatArea.value = "Arena deck submitted";
			}
		}
		editorui.addChild(bclear);
		editorui.addChild(bsave);
		editorui.addChild(bimport);
		if (usePool && user.ocard) {
			editorui.addChild(barena);
		}
		var editorcolumns = [];
		var editordecksprites = [];
		var editordeck = getDeck();
		var editormarksprite = new PIXI.Sprite(nopic);
		editormarksprite.position.set(100, 210);
		editorui.addChild(editormarksprite);
		var editormark = 0;
		processDeck();
		var editoreleicons = [];
		for (var i = 0;i < 13;i++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(8, 184 + i * 32);
			var marksprite = new PIXI.Sprite(nopic);
			marksprite.position.set(200 + i * 32, 210);
			setInteractive(sprite, marksprite);
			(function(_i) {
				sprite.click = function() { editorelement = _i; }
				marksprite.click = function() { editormark = _i; }
			})(i);
			editoreleicons.push([sprite, marksprite]);
			editorui.addChild(sprite);
			editorui.addChild(marksprite);
		}
		for (var i = 0;i < 60;i++) {
			var sprite = new PIXI.Sprite(nopic);
			sprite.position.set(100 + Math.floor(i / 10) * 100, 8 + (i % 10) * 20);
			(function(_i) {
				sprite.click = function() {
					var card = CardCodes[editordeck[_i]];
					if (usePool && !isFreeCard(card)) {
						adjustCardMinus(editordeck[_i], -1);
					}
					editordeck.splice(_i, 1);
				}
				sprite.mouseover = function() {
					cardartcode = editordeck[_i];
				}
			})(i);
			sprite.interactive = true;
			editorui.addChild(sprite);
			editordecksprites.push(sprite);
		}
		for (var i = 0;i < 6;i++) {
			editorcolumns.push([[], []]);
			for (var j = 0;j < 15;j++) {
				var sprite = new PIXI.Sprite(nopic);
				sprite.position.set(100 + i * 130, 272 + j * 20);
				if (usePool) {
					var sprcount = new PIXI.Text("", { font: "12px Dosis" });
					sprcount.position.set(102, 4);
					sprite.addChild(sprcount);
				}
				(function(_i, _j) {
					sprite.click = function() {
						if (editordeck.length < 60) {
							var code = editorcolumns[_i][1][editorelement][_j], card = CardCodes[code];
							if (usePool && !isFreeCard(card)) {
								if (!(code in cardpool) || (code in cardminus && cardminus[code] >= cardpool[code]) ||
                                    (CardCodes[code].type != PillarEnum && (cardminus[card.asUpped(false).code] || 0) + (cardminus[card.asUpped(true).code] || 0) >= 6)) {
									return;
								}
								adjustCardMinus(code, 1);
							}
							for (var i = 0;i < editordeck.length;i++) {
								var cmp = editorCardCmp(editordeck[i], code);
								if (cmp >= 0) break;
							}
							editordeck.splice(i, 0, code);
						}
					}
					sprite.mouseover = function() {
						cardartcode = editorcolumns[_i][1][editorelement][_j];
					}
				})(i, j);
				sprite.interactive = true;
				editorui.addChild(sprite);
				editorcolumns[i][0].push(sprite);
			}
			for (var j = 0;j < 13;j++) {
				editorcolumns[i][1].push(filtercards(i > 2,
                    function(x) { return x.element == j && ((i % 3 == 0 && x.type == CreatureEnum) || (i % 3 == 1 && x.type <= PermanentEnum) || (i % 3 == 2 && x.type == SpellEnum)); },
                    editorCardCmp));
			}
		}
		var cardArt = new PIXI.Sprite(nopic);
		cardArt.position.set(734, 8);
		editorui.addChild(cardArt);
		animCb = function() {
			editormarksprite.setTexture(getIcon(editormark));
			if (cardartcode) {
				cardArt.setTexture(getArt(cardartcode));
			}
			for (var i = 0;i < 13;i++) {
				for (var j = 0;j < 2;j++) {
					editoreleicons[i][j].setTexture(getIcon(i));
				}
			}
			for (var i = 0;i < editordeck.length;i++) {
				editordecksprites[i].visible = true;
				editordecksprites[i].setTexture(getCardImage(editordeck[i]));
			}
			for (;i < 60;i++) {
				editordecksprites[i].visible = false;
			}
			for (var i = 0;i < 6;i++) {
				for (var j = 0;j < editorcolumns[i][1][editorelement].length;j++) {
					var spr = editorcolumns[i][0][j], code = editorcolumns[i][1][editorelement][j], card = CardCodes[code];
					if (!usePool || card in cardpool || isFreeCard(card)) spr.visible = true;
					else spr.visible = false;
					spr.setTexture(getCardImage(code));
					if (usePool) {
						var txt = spr.getChildAt(0), card = CardCodes[code], inf = isFreeCard(card);
						if ((txt.visible = inf || code in cardpool)) {
							maybeSetText(txt, inf ? "-" : (cardpool[code] - (code in cardminus ? cardminus[code] : 0)).toString());
						}
					}
				}
				for (;j < 15;j++) {
					editorcolumns[i][0][j].visible = false;
				}
			}
		}
		mainStage = editorui;
		refreshRenderer();
	}
}
var descr = [
        "Chroma",
        "Entropy",
        "Death",
        "Gravity",
        "Earth",
        "Life",
        "Fire",
        "Water",
        "Light",
        "Air",
        "Time",
        "Darkness",
        "Aether"
];
function startElementSelect() {
	var stage = new PIXI.Stage(0x336699, true);
	chatArea.value = "Select your starter element";
	var elesel = [];
	var eledesc = new PIXI.Text("", { font: "24px Dosis" });
	eledesc.position.set(100, 250);
	stage.addChild(eledesc);
	for (var i = 0;i < 13;i++) {
		elesel[i] = new PIXI.Sprite(nopic);
		elesel[i].position.set(100 + i * 32, 300);
		(function(_i) {
			elesel[_i].mouseover = function() {
				maybeSetText(eledesc, descr[_i]);
			}
			elesel[_i].click = function() {
				var msg = { u: user.name, a: user.auth, e: _i };
				user = undefined;
				socket.emit("inituser", msg);
				startMenu();
			}
		})(i);
		elesel[i].interactive = true;
		stage.addChild(elesel[i]);
	}
	animCb = function() {
		for (var i = 0;i < 13;i++) {
			elesel[i].setTexture(getIcon(i));
		}
	}
	mainStage = stage;
	refreshRenderer();
}

function startMatch() {
	if (anims.length) {
		while (anims.length) {
			anims[0].remove();
		}
	}
	player2summon = function(cardinst) {
		var card = cardinst.card;
		var sprite = new PIXI.Sprite(nopic);
		sprite.position.set((foeplays.length % 9) * 100, Math.floor(foeplays.length / 9) * 20);
		gameui.addChild(sprite);
		foeplays.push([card, sprite]);
	}
	function drawBorder(obj, spr) {
		if (obj) {
			if (targetingMode) {
				if (targetingMode(obj)) {
					fgfx.lineStyle(2, 0xff0000);
					fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
					fgfx.lineStyle(2, 0xffffff);
				}
			} else if (obj.canactive()) {
				fgfx.lineStyle(2, obj.card.upped ?  "black" : "white" );
				fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, (obj instanceof Weapon || obj instanceof Shield ? 8 : 10));
			}
		}
	}
	function drawStatus(obj, spr) {
		var x = spr.position.x, y = spr.position.y, wid = spr.width, hei = spr.height;
		if (obj == obj.owner.gpull) {
			fgfx.beginFill(0xffaa00, .3);
			fgfx.drawRect(x - wid / 2 - 2, y - hei / 2 - 2, wid + 4, hei + 4);
			fgfx.endFill();
		}
		if (obj.status.frozen) {
			fgfx.beginFill(0x0000ff, .3);
			fgfx.drawRect(x - wid / 2 - 2, y - hei / 2 - 2, wid + 4, hei + 4);
			fgfx.endFill();
		}
		if (obj.status.delayed) {
			fgfx.beginFill(0xffff00, .3);
			fgfx.drawRect(x - wid / 2 - 2, y - hei / 2 - 2, wid + 4, hei + 4);
			fgfx.endFill();
		}
		fgfx.lineStyle(1, 0);
		if (obj.passives.airborne || obj.passives.ranged) {
			fgfx.beginFill(elecols[Air], .8);
			fgfx.drawRect(x - wid / 2 - 2, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.adrenaline) {
			fgfx.beginFill(elecols[Life], .8);
			fgfx.drawRect(x - wid / 2 + 6, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.momentum) {
			fgfx.beginFill(elecols[Gravity], .8);
			fgfx.drawRect(x - wid / 2 + 14, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.psion) {
			fgfx.beginFill(elecols[Aether], .8);
			fgfx.drawRect(x - wid / 2 + 22, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.burrowed) {
			fgfx.beginFill(elecols[Earth], .8);
			fgfx.drawRect(x - wid / 2 + 30, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		if (obj.status.poison) {
			fgfx.beginFill(obj.aflatoxin ? elecols[Darkness] : obj.status.poison > 0 ? elecols[Death] : elecols[Water], .8);
			fgfx.drawRect(x - wid / 2 + 38, y + hei / 2 - 10, 12, 12);
			fgfx.endFill();
		}
		fgfx.lineStyle(0, 0, 0);
		spr.alpha = obj.status.immaterial || obj.status.burrowed ? .7 : 1;
	}
	var cardwon;
	animCb = function() {
		if (game.phase == PlayPhase && game.turn == game.player2 && game.player2.ai && --aiDelay <= 0) {
			aiDelay = parseInt(airefresh.value) || 8;
			if (aiDelay == -2) {
				disableEffects = true;
			}
			do {
				var cmd = game.player2.ai();
				cmds[cmd[0]](cmd[1]);
			} while (aiDelay < 0 && game.turn == game.player2);
			disableEffects = false;
		}
		var pos = gameui.interactionManager.mouse.global;
		maybeSetText(winnername, game.winner ? (game.winner == game.player1 ? "Won " : "Lost ") + game.ply : "");
		maybeSetButton(game.winner ? null : endturn, endturn);
		if (!game.winner || !user) {
			var cardartcode;
			setInfo();
			for (var i = 0;i < foeplays.length;i++) {
				if (hitTest(foeplays[i][1], pos)) {
					cardartcode = foeplays[i][0].code;
					setInfo(foeplays[i][0]);
				}
			}
			for (var j = 0;j < 2;j++) {
				var pl = game.players[j];
				if (j == 0 || game.player1.precognition) {
					for (var i = 0;i < pl.hand.length;i++) {
						if (hitTest(handsprite[j][i], pos)) {
							cardartcode = pl.hand[i].card.code;
							setInfo(pl.hand[i].card);
						}
					}
				}
				if (j == 0 || !(cloakgfx.visible)) {
					for (var i = 0;i < 23;i++) {
						var cr = pl.creatures[i];
						if (cr && hitTest(creasprite[j][i], pos)) {
							cardartcode = cr.card.code;
							setInfo(cr);
						}
					}
					for (var i = 0;i < 16;i++) {
						var pr = pl.permanents[i];
						if (pr && hitTest(permsprite[j][i], pos)) {
							cardartcode = pr.card.code;
							setInfo(pr);
						}
					}
					if (pl.weapon && hitTest(weapsprite[j], pos)) {
						cardartcode = pl.weapon.card.code;
						setInfo(pl.weapon);
					}
					if (pl.shield && hitTest(shiesprite[j], pos)) {
						cardartcode = pl.shield.card.code;
						setInfo(pl.shield);
					}
				}
			}
			if (cardartcode) {
				cardart.setTexture(getArt(cardartcode));
				cardart.visible = true;
				cardart.position.y = pos.y > 300 ? 44 : 300;
			} else cardart.visible = false;
		} else {
			if (game.winner == game.player1 && !game.quest) {
				if (!cardwon) {
					var winnable = [];
					for (var i = 0;i < foeDeck.length;i++) {
						if (foeDeck[i].type != PillarEnum && foeDeck[i].rarity < 3) {
							winnable.push(foeDeck[i]);
						}
					}
					if (winnable.length) {
						cardwon = winnable[Math.floor(Math.random() * winnable.length)];
					} else {
						var elewin = foeDeck[Math.floor(Math.random() * foeDeck.length)];
						rareAllowed = 3;
						cardwon = PlayerRng.randomcard(elewin.upped, function(x) { return x.element == elewin.element && x.type != PillarEnum && x.rarity <= rareAllowed; });
						if (cardwon.rarity == 3 && Math.random() > .5)
							cardwon = PlayerRng.randomcard(elewin.upped, function(x) { return x.element == elewin.element && x.type != PillarEnum && x.rarity <= rareAllowed; });
					}
					if (!game.player2.ai || (game.level && game.level < 3)) {
						cardwon = cardwon.asUpped(false);
					}
					if (game.gold) {
						var goldwon = Math.floor(game.gold * (game.player1.hp == game.player1.maxhp ? 2 : .5 + game.player1.hp / (game.player1.maxhp * 2)));
						console.log(goldwon);
						if (game.cost) goldwon += game.cost;
						game.goldreward = goldwon;
					}
					game.cardreward = cardwon.code;
				}
			} else {
				cardart.visible = false;
			}
		}
		if (game.phase != EndPhase) {
			cancel.visible = true;
			var endturnButton = accepthand.visible ? accepthand : (endturn.visible ? endturn : null);
			var cancelButton = mulligan.visible ? mulligan : (cancel.visible ? cancel : null);
			maybeSetButton(endturnButton, game.turn == game.player1 ? (game.phase == PlayPhase ? endturn : accepthand) : null);
			maybeSetButton(cancelButton, game.turn == game.player1 ? (game.phase != PlayPhase ? mulligan : (targetingMode || discarding) ? cancel : null) : null);
		}
		maybeSetText(turntell, discarding ? "Discard" : targetingMode ? targetingText : game.turn == game.player1 ? "Your Turn" : "Their Turn");
		for (var i = 0;i < foeplays.length;i++) {
			maybeSetTexture(foeplays[i][1], getCardImage(foeplays[i][0].code));
		}
		cloakgfx.visible = game.player2.isCloaked();
		fgfx.clear();
		if (game.turn == game.player1 && !targetingMode && game.phase != EndPhase) {
			for (var i = 0;i < game.player1.hand.length;i++) {
				var card = game.player1.hand[i].card;
				if (game.player1.canspend(card.costele, card.cost)) {
					fgfx.beginFill(elecols[card.costele]);
					fgfx.drawRect(handsprite[0][i].position.x + 100, handsprite[0][i].position.y, 20, 20);
					fgfx.endFill();
				}
			}
		}
		fgfx.beginFill(0, 0);
		fgfx.lineStyle(2, 0xffffff);
		for (var j = 0;j < 2;j++) {
			for (var i = 0;i < 23;i++) {
				drawBorder(game.players[j].creatures[i], creasprite[j][i]);
			}
			for (var i = 0;i < 16;i++) {
				drawBorder(game.players[j].permanents[i], permsprite[j][i]);
			}
			drawBorder(game.players[j].weapon, weapsprite[j]);
			drawBorder(game.players[j].shield, shiesprite[j]);
		}
		if (targetingMode) {
			fgfx.lineStyle(2, 0xff0000);
			for (var j = 0;j < 2;j++) {
				if (targetingMode(game.players[j])) {
					var spr = hptext[j];
					fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
				}
				for (var i = 0;i < game.players[j].hand.length;i++) {
					if (targetingMode(game.players[j].hand[i])) {
						var spr = handsprite[j][i];
						fgfx.drawRect(spr.position.x, spr.position.y, spr.width, spr.height);
					}
				}
			}
		}
		fgfx.lineStyle(0, 0, 0);
		fgfx.endFill();
		for (var j = 0;j < 2;j++) {
			if (game.players[j].sosa) {
				fgfx.beginFill(elecols[Death], .5);
				var spr = hptext[j];
				fgfx.drawRect(spr.position.x - spr.width / 2, spr.position.y - spr.height / 2, spr.width, spr.height);
				fgfx.endFill();
			}
			if (game.players[j].flatline) {
				fgfx.beginFill(elecols[Death], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			}
			if (game.players[j].silence) {
				fgfx.beginFill(elecols[Aether], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			} else if (game.players[j].sanctuary) {
				fgfx.beginFill(elecols[Light], .3);
				fgfx.drawRect(handsprite[j][0].position.x - 2, handsprite[j][0].position.y - 2, 124, 164);
				fgfx.endFill();
			}
			for (var i = 0;i < 8;i++) {
				maybeSetTexture(handsprite[j][i], getCardImage(game.players[j].hand[i] ? (j == 0 || game.player1.precognition ? game.players[j].hand[i].card.code : "0") : "1"));
			}
			for (var i = 0;i < 23;i++) {
				var cr = game.players[j].creatures[i];
				if (cr && !(j == 1 && cloakgfx.visible)) {

					creasprite[j][i].setTexture(getCreatureImage(cr.card));
					creasprite[j][i].visible = true;
					var child = creasprite[j][i].getChildAt(0);
					child.visible = true;
					child.setTexture(getTextImage(cr.trueatk() + "|" + cr.truehp(), 10, cr.card.upped ? "black" : "white"));
					var child2 = creasprite[j][i].getChildAt(1);
					var activetext = cr.active.cast ? casttext(cr.cast, cr.castele) + cr.active.cast.activename : (cr.active.hit ? cr.active.hit.activename : "");
					child2.setTexture(getTextImage(activetext, 8, cr.card.upped ? "black" : "white"), 0.6);
					drawStatus(cr, creasprite[j][i]);
				} else creasprite[j][i].visible = false;
			}
			for (var i = 0;i < 16;i++) {
				var pr = game.players[j].permanents[i];
				if (pr && !(j == 1 && cloakgfx.visible && !pr.passives.cloak)) {
					permsprite[j][i].setTexture(getPermanentImage(pr.card.code));
					permsprite[j][i].visible = true;
					permsprite[j][i].alpha = pr.status.immaterial ? .7 : 1;
					var child = permsprite[j][i].getChildAt(0);
					child.visible = true;
					if (pr instanceof Pillar) {
						child.setTexture(getTextImage("1:" + (pr.active.auto == Actives.pend && pr.pendstate ? pr.owner.mark : pr.card.element) + " x" + pr.status.charges, 10, pr.card.upped ? "black" : "white"),0.8);
					}
					else child.setTexture(getTextImage(pr.status.charges !== undefined ? " " + pr.status.charges : ""));
					var child2 = permsprite[j][i].getChildAt(1);
					if (!(pr instanceof Pillar)) {
						child2.setTexture(getTextImage(pr.activetext().replace(" losecharge", ""), 8, pr.card.upped ? "black" : "white"), 0.6);
					}
					else
						child2.setTexture(nopic);
				} else permsprite[j][i].visible = false;
			}
			var wp = game.players[j].weapon;
			if (wp && !(j == 1 && cloakgfx.visible)) {
				weapsprite[j].visible = true;
				var child = weapsprite[j].getChildAt(0);
				child.setTexture(getTextImage(wp.activetext(), 12, wp.card.upped ? "black" : "white"));
				child.visible = true;
				var child2 = weapsprite[j].getChildAt(1);
				child2.setTexture(getTextImage(wp.trueatk() + "", 12, wp.card.upped ? "black" : "white"));
				child2.visible = true;
				weapsprite[j].setTexture(getWeaponShieldImage(wp.card.code));
				drawStatus(wp, weapsprite[j]);
			} else weapsprite[j].visible = false;
			var sh = game.players[j].shield;
			if (sh && !(j == 1 && cloakgfx.visible)) {
				shiesprite[j].visible = true;
				var dr = sh.truedr();
				var child = shiesprite[j].getChildAt(0);
				child.visible = true;
				child.setTexture(getTextImage((sh.active.shield ? " " + sh.active.shield.activename : "") + (sh.active.buff ? " " + sh.active.buff.activename : "") + (sh.active.cast ? casttext(sh.cast, sh.castele) + sh.active.cast.activename : ""), 12, sh.card.upped ? "black" : "white"));
				var child2 = shiesprite[j].getChildAt(1);
				child2.setTexture(getTextImage(sh.status.charges ? "x" + sh.status.charges: "" + sh.truedr() + "", 12, sh.card.upped ? "black" : "white"));
				child2.visible = true;
				shiesprite[j].alpha = sh.status.immaterial ? .7 : 1;
				shiesprite[j].setTexture(getWeaponShieldImage(sh.card.code));
			} else shiesprite[j].visible = false;
			marksprite[j].setTexture(getIcon(game.players[j].mark));
			for (var i = 1;i < 13;i++) {
				maybeSetText(quantatext[j].getChildAt(i - 1), game.players[j].quanta[i].toString());
			}
			for (var i = 1;i < 13;i++) {
				quantatext[j].getChildAt(i + 12 - 1).setTexture(getIcon(i));
			}
			maybeSetText(hptext[j], game.players[j].hp + "/" + game.players[j].maxhp);
			maybeSetText(poisontext[j], game.players[j].status.poison + (game.players[j].neuro ? "psn!" : "psn"));
			maybeSetText(decktext[j], game.players[j].deck.length + "cards");
			maybeSetText(damagetext[j], game.players[j].foe.expectedDamage ? "Next HP-loss:" + game.players[j].foe.expectedDamage : "");
		}
	}
	gameui = new PIXI.Stage(0x336699, true);
	var cloakgfx = new PIXI.Graphics();
	var bggame = new PIXI.Sprite(backgrounds[4]);
	gameui.addChild(bggame);
	cloakgfx.beginFill(0);
	cloakgfx.drawRect(130, 20, 660, 280);
	cloakgfx.endFill();
	gameui.addChild(cloakgfx);
	var winnername = new PIXI.Text("", { font: "16px Dosis" });
	winnername.position.set(800, 540);
	gameui.addChild(winnername);
	var endturn = makeButton(800, 540, 75, 18, buttons.endturn);
	var accepthand = makeButton(800, 540, 75, 18, buttons.accepthand);
	var cancel = makeButton(800, 500, 75, 18, buttons.cancel);
	var mulligan = makeButton(800, 500, 75, 18, buttons.mulligan);
	var resign = makeButton(8, 24, 75, 18, buttons.resign);
	var confirm = makeButton(8, 24, 75, 18, buttons.confirm);
	gameui.addChild(endturn);
	gameui.addChild(cancel);
	gameui.addChild(mulligan);
	gameui.addChild(accepthand);
	gameui.addChild(resign);
	gameui.addChild(confirm);
	confirm.visible = cancel.visible = endturn.visible = false;
	var turntell = new PIXI.Text("", { font: "16px Dosis" });
	var infotext = new PIXI.Sprite(nopic);
	var foename = new PIXI.Text(game.foename || "Unknown Opponent", { font: "bold 18px Dosis", align: "center" });
	foename.position.set(25, 75);
	gameui.addChild(foename);
	endturnFunc = endturn.click = function(e, discard) {
		if (game.winner) {
			for (var i = 0;i < foeplays.length;i++) {
				if (foeplays[i][1].parent) {
					foeplays[i][1].parent.removeChild(foeplays[i][1]);
				}
			}
			foeplays.length = 0;
			if (user && game.arena) {
				userEmit("modarena", { aname: game.arena, won: game.winner == game.player2 });
				delete game.arena;
			}
			if (user && game.quest) {
				if (game.winner == game.player1 && (user.quest[game.quest[0]] <= game.quest[1] || !(game.quest[0] in user.quest))) {
					userEmit("updatequest", { quest: game.quest[0], newstage: game.quest[1] + 1 });
					user.quest[game.quest[0]] = game.quest[1] + 1;
				}
			}
			if (user && game.winner == game.player1) {
				victoryScreen();
			}
			else {
				if (game.quest)
					startQuestWindow();
				else
					startMenu();
				game = undefined;
			}
		} else if (game.turn == game.player1) {

			if (discard == undefined && game.player1.hand.length == 8) {
				discarding = true;
			} else {
				discarding = false;
				if (!game.player2.ai) {
					socket.emit("endturn", discard);
				}
				game.player1.endturn(discard);
				targetingMode = undefined;
				for (var i = 0;i < foeplays.length;i++) {
					if (foeplays[i][1].parent) {
						foeplays[i][1].parent.removeChild(foeplays[i][1]);
					}
				}
				foeplays.length = 0;
			}
		}
	}
	accepthandfunc = accepthand.click = function() {
		if (!game.player2.ai) {
			socket.emit("mulligan", true);
		}
		progressMulligan(game);
		if (game.phase == MulliganPhase2 && game.player2.ai) {
			progressMulligan(game);
		}
	}
	cancelFunc = cancel.click = function() {
		if (resigning) {
			maybeSetButton(confirm, resign);
			resigning = false;
		} else if (game.turn == game.player1) {
			if (targetingMode) {
				targetingMode = targetingModeCb = null;
			} else if (discarding) {
				discarding = false;
			}
		}
	}
	mulligan.click = function() {
		if ((game.phase == MulliganPhase1 || game.phase == MulliganPhase2) && game.turn == game.player1 && game.player1.hand.length > 0) {
			game.player1.drawhand(game.player1.hand.length - 1);
			socket.emit("mulligan");
		}
	}
	var resigning;
	resign.click = function() {
		maybeSetButton(resign, confirm);
		resigning = true;
	}
	confirm.click = function() {
		if (!game.player2.ai) {
			socket.emit("foeleft");
		}
		startMenu();
	}

	turntell.position.set(800, 570);
	gameui.addChild(turntell);
	infotext.position.set(100, 584);
	gameui.addChild(infotext);
	function setInfo(obj) {
		if (obj && !(obj.owner == game.player2 && cloakgfx.visible)) {
			infotext.setTexture(getTextImage(obj.info(), 16));
			if (obj.card) {
				setInfoBox(obj);
			}
		}
		else {
			infotext.setTexture(nopic);
			infobox.setTexture(nopic);
		}
	}
	function setInfoBox(obj) {
		var rend = new PIXI.RenderTexture((obj instanceof Weapon || obj instanceof Shield ? 80 : 64)+12, 200);
		var graphics = new PIXI.Graphics();
		var words = obj.info().split(" ");
		var x = 2, y = 2;
		var template = new PIXI.Graphics();
		for (var i = 0;i < words.length;i++) {
			var wordgfx = new PIXI.Sprite(getTextImage(words[i], 10,"white"));
			if (x + wordgfx.width > rend.width - 2) {
				x = 2;
				y += 12;
			}
			wordgfx.position.set(x, y);
			x += wordgfx.width + 3;
			template.addChild(wordgfx);
		}
		graphics.beginFill("black", 0.7);
		graphics.drawRect(0, 0, rend.width, y+12);
		graphics.endFill();
		graphics.addChild(template);
		rend.render(graphics);
		infobox.setTexture(rend);
		infobox.anchor.set(0.5, 0);
		infobox.position.set(gameui.getMousePosition().x, gameui.getMousePosition().y-(y+10));
		infobox.visible = true;
	}
	var handsprite = [new Array(8), new Array(8)];
	var creasprite = [new Array(23), new Array(23)];
	var permsprite = [new Array(16), new Array(16)];
	var weapsprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var shiesprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var marksprite = [new PIXI.Sprite(nopic), new PIXI.Sprite(nopic)];
	var quantatext = [new PIXI.DisplayObjectContainer(), new PIXI.DisplayObjectContainer()];
	var hptext = [new PIXI.Text("", { font: "18px Dosis" }), new PIXI.Text("", { font: "18px Dosis" })];
	var damagetext = [new PIXI.Text("", { font: "14px Dosis" }), new PIXI.Text("", { font: "14px Dosis" })];
	var poisontext = [new PIXI.Text("", { font: "16px Dosis" }), new PIXI.Text("", { font: "16px Dosis" })];
	var decktext = [new PIXI.Text("", { font: "16px Dosis" }), new PIXI.Text("", { font: "16px Dosis" })];
	for (var j = 0;j < 2;j++) {
		(function(_j) {
			for (var i = 0;i < 8;i++) {
				handsprite[j][i] = new PIXI.Sprite(nopic);
				handsprite[j][i].position.set(j ? 20 : 780, (j ? 130 : 310) + 20 * i);
				(function(_i) {
					handsprite[j][i].click = function() {
						if (game.phase != PlayPhase) return;
						var cardinst = game.players[_j].hand[_i];
						if (cardinst) {
							if (!_j && discarding) {
								endturn.click(null, _i);
							} else if (targetingMode) {
								if (targetingMode(cardinst)) {
									targetingMode = undefined;
									targetingModeCb(cardinst);
								}
							} else if (!_j && cardinst.canactive()) {
								if (cardinst.card.type != SpellEnum) {
									console.log("summoning " + _i);
									socket.emit("cast", tgtToBits(cardinst));
									cardinst.useactive();
								} else {
									getTarget(cardinst, cardinst.card.active, function(tgt) {
										socket.emit("cast", tgtToBits(cardinst) | tgtToBits(tgt) << 9);
										cardinst.useactive(tgt);
									});
								}
							}
						}
					}
				})(i);
				gameui.addChild(handsprite[j][i]);
			}
			for (var i = 0;i < 23;i++) {
				creasprite[j][i] = new PIXI.Sprite(nopic);
				var stattext = new PIXI.Sprite(nopic);
				stattext.position.set(-31, -32);
				var activetext = new PIXI.Sprite(nopic);
				activetext.position.set(-31, -42);
				creasprite[j][i].addChild(stattext);
				creasprite[j][i].addChild(activetext);
				creasprite[j][i].anchor.set(.5, .5);
				creasprite[j][i].position = creaturePos(j, i);
				(function(_i) {
					creasprite[j][i].click = function() {
						if (game.phase != PlayPhase) return;
						var crea = game.players[_j].creatures[_i];
						if (!crea) return;
						if (targetingMode && targetingMode(crea)) {
							targetingMode = undefined;
							targetingModeCb(crea);
						} else if (_j == 0 && !targetingMode && crea.canactive()) {
							getTarget(crea, crea.active.cast, function(tgt) {
								targetingMode = undefined;
								socket.emit("cast", tgtToBits(crea) | tgtToBits(tgt) << 9);
								crea.useactive(tgt);
							});
						}
					}
				})(i);
				gameui.addChild(creasprite[j][i]);
			}
			for (var i = 0;i < 16;i++) {
				permsprite[j][i] = new PIXI.Sprite(nopic);
				var permtext = new PIXI.Sprite(nopic);
				permtext.position.set(-31, -32);
				var activetext = new PIXI.Sprite(nopic);
				activetext.position.set(-31, -42);
				permsprite[j][i].addChild(permtext);
				permsprite[j][i].addChild(activetext);
				permsprite[j][i].anchor.set(.5, .5);
				permsprite[j][i].position = permanentPos(j, i);
				(function(_i) {
					permsprite[j][i].click = function() {
						if (game.phase != PlayPhase) return;
						var perm = game.players[_j].permanents[_i];
						if (!perm) return;
						if (targetingMode && targetingMode(perm)) {
							targetingMode = undefined;
							targetingModeCb(perm);
						} else if (_j == 0 && !targetingMode && perm.canactive()) {
							getTarget(perm, perm.active.cast, function(tgt) {
								targetingMode = undefined;
								socket.emit("cast", tgtToBits(perm) | tgtToBits(tgt) << 9);
								perm.useactive(tgt);
							});
						}
					}
				})(i);
				gameui.addChild(permsprite[j][i]);
			}
			setInteractive.apply(null, handsprite[j]);
			setInteractive.apply(null, creasprite[j]);
			setInteractive.apply(null, permsprite[j]);
			weapsprite[j].anchor.set(.5, .5);
			shiesprite[j].anchor.set(.5, .5);
			marksprite[j].anchor.set(.5, .5);
			weapsprite[j].position.set(666, 512);
			shiesprite[j].position.set(710, 532);
			marksprite[j].position.set(750, 470);
			var weaptext = new PIXI.Sprite(nopic);
			weaptext.position.set(-40, -51);
			var atktext = new PIXI.Sprite(nopic);
			atktext.position.set(-39, -39);
			weapsprite[j].addChild(weaptext);
			weapsprite[j].addChild(atktext);
			var shietext = new PIXI.Text(nopic);
			shietext.position.set(-40, -51);
			var deftext = new PIXI.Sprite(nopic);
			deftext.position.set(-39, -39);
			shiesprite[j].addChild(shietext);
			shiesprite[j].addChild(deftext);
			weapsprite[j].click = function() {
				if (game.phase != PlayPhase) return;
				var weap = game.players[_j].weapon;
				if (!weap) return
				if (targetingMode && targetingMode(weap)) {
					targetingMode = undefined;
					targetingModeCb(weap);
				} else if (_j == 0 && !targetingMode && weap.canactive()) {
					getTarget(weap, weap.active.cast, function(tgt) {
						targetingMode = undefined;
						socket.emit("cast", tgtToBits(weap) | tgtToBits(tgt) << 9);
						weap.useactive(tgt);
					});
				}
			}
			shiesprite[j].click = function() {
				if (game.phase != PlayPhase) return;
				var shie = game.players[_j].shield;
				if (!shie) return
				if (targetingMode && targetingMode(shie)) {
					targetingMode = undefined;
					targetingModeCb(shie);
				} else if (_j == 0 && !targetingMode && shie.canactive()) {
					getTarget(shie, shie.active.cast, function(tgt) {
						targetingMode = undefined;
						socket.emit("cast", tgtToBits(shie) | tgtToBits(tgt) << 9);
						shie.useactive(tgt);
					});
				}
			}
			if (j) {
				reflectPos(weapsprite[j]);
				reflectPos(shiesprite[j]);
				reflectPos(marksprite[j]);
			}
			gameui.addChild(weapsprite[j]);
			gameui.addChild(shiesprite[j]);
			gameui.addChild(marksprite[j]);
			hptext[j].anchor.set(.5, .5);
			poisontext[j].anchor.set(.5, .5);
			decktext[j].anchor.set(.5, .5);
			damagetext[j].anchor.set(.5, .5);
			quantatext[j].position.set(j ? 792 : 0, j ? 100 : 308);
			hptext[j].position.set(50, 550);
			poisontext[j].position.set(50, 570);
			decktext[j].position.set(50, 530);
			damagetext[j].position.set(50, 510);
			if (j) {
				reflectPos(hptext[j]);
				reflectPos(poisontext[j]);
				reflectPos(decktext[j]);
				reflectPos(damagetext[j]);
			}
			var child;
			for (var k = 1;k < 13;k++) {
				quantatext[j].addChild(child = new PIXI.Text("", { font: "16px Dosis" }));
				child.position.set((k & 1) ? 32 : 86, Math.floor((k - 1) / 2) * 32 + 8);
			}
			for (var k = 1;k < 13;k++) {
				quantatext[j].addChild(child = new PIXI.Sprite(nopic));
				child.position.set((k & 1) ? 0 : 54, Math.floor((k - 1) / 2) * 32);
			}
			hptext[j].mouseover = function() {
				setInfo(game.players[_j]);
			}
			hptext[j].click = function() {
				if (game.phase != PlayPhase) return;
				if (targetingMode && targetingMode(game.players[_j])) {
					targetingMode = undefined;
					targetingModeCb(game.players[_j]);
				}
			}
		})(j);
		setInteractive.apply(null, weapsprite);
		setInteractive.apply(null, shiesprite);
		setInteractive.apply(null, hptext);
		gameui.addChild(quantatext[j]);
		gameui.addChild(hptext[j]);
		gameui.addChild(poisontext[j]);
		gameui.addChild(decktext[j]);
		gameui.addChild(damagetext[j]);
	}
	var infobox = new PIXI.Sprite(nopic);
	gameui.addChild(infobox);
	var fgfx = new PIXI.Graphics();
	gameui.addChild(fgfx);
	var cardart = new PIXI.Sprite(nopic);
	cardart.position.set(600, 300);
	gameui.addChild(cardart);
	mainStage = gameui;
	refreshRenderer();
}

function startArenaInfo(info) {
	if (!info) {
		chatArea.value = "You do not have an arena deck";
	}
	var stage = new PIXI.Stage(0x336699, true);
	var winloss = new PIXI.Text((info.win || 0) + " - " + (info.loss || 0), { font: "16px Dosis" });
	winloss.position.set(200, 200);
	stage.addChild(winloss);
	var bret = new PIXI.Text("Return", { font: "16px Dosis" });
	bret.position.set(200, 400);
	bret.interactive = true;
	bret.click = startMenu;
	stage.addChild(bret);
	var ocard = new PIXI.Sprite(nopic);
	ocard.position.set(600, 300);
	stage.addChild(ocard);
	animCb = function() {
		if (info.card) {
			ocard.setTexture(getArt(info.card));
		}
	}
	mainStage = stage;
	refreshRenderer();
}

function startArenaTop(info) {
	if (!info) {
		chatArea.value = "??";
	}
	var stage = new PIXI.Stage(0x336699, true);
	for (var i = 0;i < info.length;i++) {
		var infotxt = new PIXI.Text(info[i], { font: "16px Dosis" });
		infotxt.position.set(200, 100 + i * 20);
		stage.addChild(infotxt);
	}
	var bret = new PIXI.Text("Return", { font: "16px Dosis" });
	bret.position.set(200, 400);
	bret.interactive = true;
	bret.click = startMenu;
	stage.addChild(bret);
	mainStage = stage;
	refreshRenderer();
}

var foeplays = [];
var tximgcache = [];

function getTextImage(text, font, color, iconsize) {
	if (color === undefined) color = "black";
	if (!(font in tximgcache)) {
		tximgcache[font] = {};
	}
	if (!(text in tximgcache[font])) {
		tximgcache[font][text] = {};
	} else if (color in tximgcache[font][text]) {
		return tximgcache[font][text][color];
	}
	var fontprop = { font: font + "px Dosis", fill: color };
	var doc = new PIXI.DisplayObjectContainer();
	var pieces = text.replace(/\|/g, " | ").split(/(\d\d?:\d\d?)/);
	var x = 0;
	for (var i = 0;i < pieces.length;i++) {
		var piece = pieces[i];
		if (/^\d\d?:\d\d?$/.test(piece)) {
			var parse = piece.split(":");
			var num = parseInt(parse[0]);
			var icon = getIcon(parseInt(parse[1]));
			for (var j = 0;j < num;j++) {
				var spr = new PIXI.Sprite(icon);
				size = iconsize || 1;
				spr.scale.set(.375*size, .375*size);
				spr.position.x = x;
				x += 12;
				doc.addChild(spr);
			}
		} else {
			var txt = new PIXI.Text(piece, fontprop);
			txt.position.x = x;
			x += txt.width;
			doc.addChild(txt);
		}
	}
	var rtex = new PIXI.RenderTexture(x, 16);
	rtex.render(doc);
	return tximgcache[font][text][color] = rtex;
}

var cmds = {};
cmds.endturn = function(data) {
	game.player2.endturn(data);
}
cmds.cast = function(bits) {
	var c = bitsToTgt(bits & 511), t = bitsToTgt((bits >> 9) & 511);
	console.log("cast: " + c.card.name + " " + (t ? (t instanceof Player ? t == game.player1 : t.card.name) : "-"));
	if (c instanceof CardInstance) {
		player2summon(c);
	}
	c.useactive(t);
}
var socket = io.connect(location.hostname, { port: 13602 });
socket.on("pvpgive", initGame);
socket.on("tradegive", initTrade)
socket.on("foearena", function(data) {
	var deck = etg.decodedeck(data.deck);
	deck = doubleDeck(deck);
	chatArea.value = data.name + ": " + deck.join(" ");
	initGame({ first: data.first, deck: deck, urdeck: getDeck(), seed: data.seed, hp: data.hp, cost: data.cost, foename: data.name }, aievalopt.checked ? aiEvalFunc : aiFunc);
	game.arena = data.name;
	game.gold = 10;
	game.cost = 10;
});
socket.on("arenainfo", startArenaInfo);
socket.on("arenatop", startArenaTop);
socket.on("userdump", function(data) {
	user = data;
	if (user.deck) {
		user.deck = etg.decodedeck(user.deck);
		deckimport.value = user.deck.join(" ");
	}
	if (user.pool) {
		user.pool = etg.decodedeck(user.pool);
	}
	if (user.starter) {
		user.starter = etg.decodedeck(user.starter);
	}
	if (!user.quest)
		user.quest = {};
	convertQuest();
	startMenu();
});
socket.on("passchange", function(data) {
	user.auth = data;
	chatArea.value = "Password updated";
});
socket.on("endturn", cmds.endturn);
socket.on("cast", cmds.cast);
socket.on("foeleft", function(data) {
	if (game && !game.player2.ai) {
		setWinner(game, game.player1);
	}
});
socket.on("chat", function(data) {
	console.log("message gotten");
	var u = data.u ? data.u + ": " : "";
	var color = "black";
	if (data.mode) {
		if (data.mode == "pm") {
			color = "blue";
		}
		if (data.mode == "info")
			color = "red";
	}
	if (data.mode == "guest")
		chatBox.innerHTML += "<font color=black><i><b>" + u + "</b>" + data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</i></font>";
	else
		chatBox.innerHTML += "<font color=" + color + "><b>" + u + "</b>" + data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</font>";
	chatBox.innerHTML += "<br>";
	chatBox.scrollTop = chatBox.scrollHeight;
});
socket.on("mulligan", function(data) {
	if (data === true) {
		progressMulligan(game);
	} else {
		game.player2.drawhand(game.player2.hand.length - 1);
	}
});
socket.on("cardchosen", function(data) {
	player2Card = data.card;
	myTurn = true;
	console.log("Card recieved")
	console.log(player2Card);
});
socket.on("tradedone", function(data) {
	console.log("Trade done!")
	user.pool.push(data.newcard);
	user.pool.splice(user.pool.indexOf(data.oldcard), 1);
	startMenu();
});
socket.on("tradecanceled", function(data) {
	startMenu();
});
function maybeSendChat(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (chatinput.value) {
		if (user)
			userEmit("chat", { message: chatinput.value });
		else {
			if (!guestname) guestname = randomGuestName();
			var name = username.value ? username.value : guestname;

			socket.emit("guestchat", { message: chatinput.value, name: name });
		}
		chatinput.value = "";
	}
}
function randomGuestName() {
	res = "";
	for (var i = 0;i < 5;i++) {
		res += Math.floor(Math.random() * 10);
	}
	return res;
}
function maybeLogin(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (username.value) {
		loginClick();
	}
}
function maybeChallenge(e) {
	e.cancelBubble = true;
	if (e.keyCode != 13) return;
	if (foename.value) {
		challengeClick();
	}
}
function animate() {
	setTimeout(requestAnimate, 40);
	if (animCb) {
		animCb();
	}
	for (var i = anims.length - 1;i >= 0;i--) {
		anims[i].next();
	}
	renderer.render(mainStage);
}
function requestAnimate() { requestAnimFrame(animate); }
document.addEventListener("keydown", function(e) {
	if (mainStage == gameui) {
		if (e.keyCode == 32) {
			if (game.turn == game.player1 && (game.phase == MulliganPhase1 || game.phase == MulliganPhase2))
				accepthandfunc();
			else
				endturnFunc();
		} else if (e.keyCode == 8) {
			cancelFunc();
		} else return;
		e.preventDefault();
	}
});
document.addEventListener("click", function(e) {
	if (e.pageX < 900 && e.pageY < 600) {
		e.preventDefault();
	}
});
function convertQuest() {
	for (var q in user.quest) {
		q = parseInt(q);
	}
}
function loginClick() {
	if (!user) {
		var xhr = new XMLHttpRequest();
		xhr.open("POST", "auth?u=" + encodeURIComponent(username.value) + (password.value.length ? "&p=" + encodeURIComponent(password.value) : ""), true);
		xhr.onreadystatechange = function() {
			if (this.readyState == 4) {
				if (this.status == 200) {
					user = JSON.parse(this.responseText);
					if (!user) {
						chatArea.value = "No user";
					} else if (!user.pool && !user.starter) {
						startElementSelect();
					} else {
						user.deck = etg.decodedeck(user.deck);
						deckimport.value = user.deck.join(" ");
						if (user.pool || user.pool == "") {
							user.pool = etg.decodedeck(user.pool);
						}
						if (user.starter) {
							user.starter = etg.decodedeck(user.starter);
						}
						if (!user.quest) {
							user.quest = {};
						}
						console.log(user.quest);
						convertQuest();
						startMenu();
					}
				} else if (this.status == 404) {
					chatArea.value = "Incorrect password";
				} else if (this.status == 502) {
					chatArea.value = "Error verifying password";
				}
			}
		}
		xhr.send();
	}
}
function changeClick() {
	userEmit("passchange", { p: password.value });
}
function challengeClick() {
	if (Cards) {
		if (user && user.deck) {
			userEmit("foewant", { f: foename.value, deck: user.deck });
		} else {
			var deck = getDeck();
			if ((user && (!user.deck || user.deck.length < 31)) || deck.length < 11) {
				startEditor();
				return;
			}
			socket.emit("pvpwant", { deck: deck, room: foename.value });
		}
	}
}
function tradeClick() {
	if (Cards && user)
		userEmit("tradewant", { f: foename.value });
}