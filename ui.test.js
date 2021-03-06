"use strict"
var Cards, CardCodes, Targeting, targetingMode, targetingModeCb, game, player1, player2, players;
var MersenneTwister = require("./MersenneTwister");
var gameui = {addChild:function(){}};
disableEffects = true;
function tgtToPos(){
	return {x:0, y:0};
}
function creaturePos(){
	return {x:0, y:0};
}
function initTest(){
	game = mkGame(true, 5489);
	game.player1.mark = game.player2.mark = Entropy;
	player1 = game.player1;
	player2 = game.player2;
	players = game.players;
}
function initHand(pl){
	for(var i=1; i<arguments.length; i++){
		pl.hand[i-1] = new CardInstance(arguments[i], pl);
	}
}
loadcards(function(cards, cardcodes, targeting) {
	Cards = cards;
	CardCodes = cardcodes;
	Targeting = targeting;
	test("Upped Alignment", function() {
		for(var key in CardCodes){
			var card = CardCodes[key];
			var un = card.asUpped(false), up=card.asUpped(true);
			if (!un || !up){
				ok(false, key);
			}
		}
		ok(true);
	});
	test("Adrenaline", function() {
		initTest();
		(player1.creatures[0] = new Creature(Cards.Devourer, player1)).status.adrenaline = 1;
		(player1.creatures[1] = new Creature(Cards.HornedFrog, player1)).status.adrenaline = 1;
		(player1.creatures[2] = new Creature(Cards.RubyDragon, player1)).status.adrenaline = 1;
		player2.quanta[Life]=3;
		player1.endturn();
		equal(player2.hp, 68, "dmg");
		equal(player1.quanta[Darkness], 2, "Absorbed");
		equal(player2.quanta[Life], 1, "Lone Life");
	});
	test("Aflatoxin", function() {
		initTest();
		(player1.creatures[0] = new Creature(Cards.Devourer, player1)).status.aflatoxin = true;
		player1.creatures[0].die();
		ok(player1.creatures[0], "Something");
		equal(player1.creatures[0].card, Cards.MalignantCell, "Malignant");
	});
	test("BoneWall", function() {
		initTest();
		player1.quanta[Death] = 10;
		initHand(player1, Cards.BoneWall);
		player1.hand[0].useactive();
		new Creature(Cards.RubyDragon, player2).place();
		new Creature(Cards.RubyDragon, player2).place();
		new Creature(Cards.RubyDragon, player2).place();
		player1.endturn();
		player2.endturn();
		ok(player1.shield, "BW exists");
		equal(player1.shield.status.charges, 4, "4 charges");
		player2.creatures[0].die();
		equal(player1.shield.status.charges, 6, "6 charges");
	});
	test("Boneyard", function() {
		initTest();
		new Creature(Cards.Devourer, player1).place();
		new Permanent(Cards.Boneyard, player1).place();
		player1.creatures[0].die();
		ok(player1.creatures[0], "Something");
		equal(player1.creatures[0].card, Cards.Skeleton, "Skeleton");
	});
	test("Deckout", function() {
		initTest();
		player1.endturn();
		equal(game.winner, player1);
	});
	test("Destroy", function() {
		initTest();
		player1.quanta[Death] = 10;
		initHand(player1, Cards.AmethystPillar, Cards.AmethystPillar, Cards.SoulCatcher, Cards.Shield, Cards.Dagger);
		while(player1.hand.length){
			player1.hand[0].useactive();
		}
		equal(player1.permanents[0].status.charges, 2, "2 charges");
		Actives.destroy(player2, player1.permanents[0]);
		equal(player1.permanents[0].status.charges, 1, "1 charge");
		Actives.destroy(player2, player1.permanents[0]);
		ok(!player1.permanents[0], "poof");
		equal(player1.permanents[1].card, Cards.SoulCatcher, "SoulCatcher");
		Actives.destroy(player2, player1.permanents[1]);
		ok(!player1.permanents[1], "SoulCatcher gone");
		equal(player1.shield.card, Cards.Shield, "Shield");
		Actives.destroy(player2, player1.shield);
		ok(!player1.shield, "Shield gone");
		equal(player1.weapon.card, Cards.Dagger, "Dagger");
		Actives.destroy(player2, player1.weapon);
		ok(!player1.weapon, "Dagger gone");
		initHand(player1, Cards.BoneWall);
		player1.hand[0].useactive();
		equal(player1.shield.status.charges, 7, "7 bones");
		Actives.destroy(player2, player1.shield);
		equal(player1.shield.status.charges, 6, "6 bones");
		for(var i=0; i<6; i++){
			Actives.destroy(player2, player1.shield);
		}
		ok(!player1.shield, "This town is all in hell");
	});
	test("Devourer", function() {
		initTest();
		new Creature(Cards.Devourer, player1).place();
		player2.quanta[Light] = 1;
		player1.endturn();
		equal(player2.quanta[Light], 0, "Light");
		equal(player1.quanta[Darkness], 1, "Darkness");
	});
	test("Disarm", function() {
		initTest();
		new Creature(Cards.Monk, player1).place();
		new Weapon(Cards.Dagger, player2).place();
		player1.endturn();
		ok(!player2.weapon, "Disarmed");
		equal(player2.hand[0].card, Cards.Dagger, "In hand");
	});
	test("Earthquake", function() {
		initTest();
		initHand(player1, Cards.AmethystPillar, Cards.AmethystPillar, Cards.AmethystPillar, Cards.AmethystPillar, Cards.AmethystPillar, Cards.AmethystPillar, Cards.AmethystPillar, Cards.AmethystPillar);
		for(var i=0; i<5; i++){
			player1.hand[0].useactive();
		}
		equal(player1.hand.length, 3, "handlength");
		var pillars = player1.permanents[0];
		ok(pillars instanceof Pillar, "ispillar");
		equal(pillars.status.charges, 5, "5 charges");
		Actives.earthquake(player2, pillars);
		equal(pillars.status.charges, 2, "2 charges");
		Actives.earthquake(player2, pillars);
		ok(!player1.permanents[0], "poof");
	});
	test("Eclipse", function() {
		initTest();
		player1.deck = [Cards.Ash, Cards.Ash, Cards.Ash];
		player2.deck = [Cards.Ash, Cards.Ash, Cards.Ash];
		for(var i=0; i<2; i++)
			new Creature(Cards.Vampire, player1).place();
		player1.hp = 50;
		player1.endturn();
		player2.endturn();
		equal(player2.hp, 92, "Noclipse dmg'd");
		equal(player1.hp, 58, "Noclipse vamp'd");
		player1.permanents[0] = new Permanent(Cards.Eclipse, player1);
		player1.endturn();
		equal(player2.hp, 80, "Eclipse dmg'd");
		equal(player1.hp, 70, "Eclipse vamp'd");
		equal(player1.creatures[0].truehp(), 4, "hp buff'd");
	});
	test("Gpull", function() {
		initTest();
		new Creature(Cards.MassiveDragon, player2).place();
		player2.gpull = player2.creatures[0];
		new Creature(Cards.Scorpion, player1).place();
		player2.deck = [Cards.MassiveDragon];
		player1.endturn();
		equal(player2.gpull.hp, 29, "dmg redirected");
		equal(player2.gpull.status.poison, 1, "psn redirected");
		player2.gpull.die();
		ok(!player2.gpull, "gpull death poof");
	});
	test("Hope", function() {
		initTest();
		player1.shield = new Shield(Cards.Hope, player1);
		new Creature(Cards.Photon, player1).place();
		for(var i=1; i<4; i++){
			player1.creatures[i] = new Creature(Cards.RayofLight, player1);
		}
		player1.endturn();
		equal(player1.shield.truedr(), 3, "DR");
		equal(player1.quanta[Light], 3, "RoL");
	});
	test("Lobotomize", function() {
		initTest();
		var dev = new Creature(Cards.Devourer, player1);
		ok(!isEmpty(dev.active), "Actives");
		Actives.lobotomize(player1, dev);
		ok(isEmpty(dev.active), "No actives");
	});
	test("Obsession", function() {
		initTest();
		initHand(player1, Cards.GhostofthePast, Cards.GhostofthePast, Cards.GhostofthePast, Cards.GhostofthePast, Cards.GhostofthePast, Cards.GhostofthePast, Cards.GhostofthePast, Cards.GhostofthePast);
		player1.endturn(0);
		equal(player1.hp, 92, "Damage");
		equal(player1.hand.length, 7, "Discarded");
	});
	test("Parallel", function() {
		initTest();
		var damsel = new Creature(Cards.Damselfly, player1);
		damsel.place();
		Actives.parallel(player1, damsel);
		equal(player1.creatures[1].card, Cards.Damselfly, "PU'd");
		Actives.web(player1, damsel);
		ok(!damsel.passives.airborne && player1.creatures[1].passives.airborne, "Web'd");
	});
	test("Phoenix", function() {
		initTest();
		var phoenix = new Creature(Cards.Phoenix, player1);
		phoenix.place();
		Actives.lightning(player1, phoenix);
		equal(player1.creatures[0].card, Cards.Ash, "Ash");
	});
	test("Purify", function() {
		initTest();
		Actives.poison3(player1);
		equal(player2.status.poison, 3, "3");
		Actives.poison3(player1, player2);
		equal(player2.status.poison, 6, "6");
		Actives.purify(player1, player2);
		equal(player2.status.poison, -2, "-2");
		Actives.purify(player1, player2);
		equal(player2.status.poison, -4, "-4");
	});
	test("Reflect", function() {
		initTest();
		Actives.lightning(player1, player2);
		ok(player1.hp == 100 && player2.hp == 95, "Plain spell");
		player2.shield = new Shield(Cards.MirrorShield, player2);
		Actives.lightning(player1, player2);
		ok(player1.hp == 95 && player2.hp == 95, "Reflected spell");
		player1.shield = new Shield(Cards.MirrorShield, player1);
		Actives.lightning(player1, player2);
		ok(player1.hp == 90 && player2.hp == 95, "Unreflected reflected spell");
	});
	test("Steal", function() {
		initTest();
		(player1.shield = new Shield(Cards.BoneWall, player1)).status.charges=3;
		Actives.steal(player2, player1.shield);
		ok(player1.shield && player1.shield.status.charges == 2, "Wish bones");
		ok(player2.shield && player2.shield.status.charges == 1, "stole 1");
		Actives.steal(player2, player1.shield);
		ok(player1.shield && player1.shield.status.charges == 1, "Lone bone");
		ok(player2.shield && player2.shield.status.charges == 2, "stole 2");
		Actives.steal(player2, player1.shield);
		ok(!player1.shield, "This town is all in hell");
		ok(player2.shield && player2.shield.status.charges == 3, "stole 3");
	});
	test("Steam", function() {
		initTest();
		var steam = new Creature(Cards.SteamMachine, game.player1);
		steam.usedactive = false;
		steam.place();
		equal(steam.trueatk(), 0, "0");
		steam.useactive();
		equal(steam.trueatk(), 5, "5");
		steam.attack();
		equal(steam.trueatk(), 4, "4");
	});
	test("Voodoo", function() {
		initTest();
		var voodoo = new Creature(Cards.VoodooDoll, player1);
		voodoo.place();
		Actives.lightning(player1, voodoo);
		Actives.infect(player1, voodoo);
		equal(voodoo.hp, 11, "dmg");
		equal(player2.hp, 95, "foe dmg");
		equal(voodoo.status.poison, 1, "psn");
		equal(player2.status.poison, 1, "foe psn");
		Actives.holylight(player1, voodoo);
		equal(voodoo.hp, 1, "holy dmg");
		equal(player2.hp, 85, "foe holy dmg");
	});
});