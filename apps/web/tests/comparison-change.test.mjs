import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { gameContentSchema,createInitialState,applyGameAction,currentVoiceInstruction } from "@lumikids/shared";
import { ComparisonChangeGame } from "../src/features/game-runtime/components/comparison-change-game.tsx";
import { GameRuntime } from "../src/features/game-runtime/game-runtime.tsx";
import { QuantityGame } from "../src/features/game-runtime/components/quantity-game.tsx";
import { OCEAN_ACTORS, OCEAN_PENGUIN } from "../src/features/game-runtime/environment/ocean-stage.ts";
import { createOceanPenguin } from "../src/features/game-runtime/environment/ocean-penguin.ts";
import * as THREE from "three";
import { validateGameRequest,parseGeneratedGame } from "../src/features/game-creation/api.ts";
import { createGameCreationController } from "../src/features/game-creation/controller.ts";
import { moveComparisonObject } from "../src/features/game-runtime/model/comparison-adjustment.ts";

const assetId="00000000-0000-4000-8000-000000000001",basketAssetId="00000000-0000-4000-8000-000000000002";
const content=gameContentSchema.parse({schemaVersion:1,gameType:"QUANTITY_COMPARISON_CHANGE",instruction:"Ba màn",instructions:"Cùng bé chơi",items:[{id:"car",assetId}],basketAssetId,completionRule:"ALL_QUESTIONS_COMPLETED",questions:[{id:"compare",mode:"COMPARE",assetId,initialCount:3,targetCount:5,instruction:"Bé hãy kéo dấu phù hợp vào ô nhé!"},{id:"add",mode:"ADD",assetId,initialCount:2,targetCount:6,instruction:"Bé hãy thêm để có sáu ô tô nhé!"},{id:"remove",mode:"REMOVE",assetId,initialCount:7,targetCount:0,instruction:"Bé hãy lấy bớt để không còn ô tô nhé!"}]});
const assetUrls={[assetId]:"/car.png",[basketAssetId]:"/basket.png"};

test("edits move the exact dragged item, allow overshooting and undo without submitting an answer",()=>{
  const q=content.questions[1],initial=[0,1];
  const added=moveComparisonObject(q,initial,9,"inside");
  assert.deepEqual(added,[0,1,9]);assert.deepEqual(initial,[0,1]);
  assert.deepEqual(moveComparisonObject(q,added,9,"outside"),initial);
  assert.equal(moveComparisonObject(q,added,0,"outside"),added);
  assert.equal(moveComparisonObject(q,added,11,"inside"),added);
  let full=initial;
  for(let index=2;index<10;index++)full=moveComparisonObject(q,full,index,"inside");
  assert.equal(full.length,10);assert.ok(full.length>q.targetCount);
  const removing=content.questions[2],before=[0,1,2,3,4,5,6];
  const after=moveComparisonObject(removing,before,3,"outside");
  assert.deepEqual(after,[0,1,2,4,5,6]);
  assert.deepEqual(moveComparisonObject(removing,after,3,"inside"),[0,1,2,4,5,6,3]);
});

test("three modes render countable pictures, comparison symbols and explicit confirmation without hints",()=>{
  const actions=[];
  for(const [index,q] of content.questions.entries()) {
    const state={...createInitialState(content),solvedQuestionIds:content.questions.slice(0,index).map(q=>q.id)};
    const markup=renderToStaticMarkup(React.createElement(ComparisonChangeGame,{content,state,assetUrls,onAction:a=>actions.push(a)}));
    assert.match(markup,new RegExp(q.instruction));
    if(q.mode==="COMPARE") {
      assert.match(markup,/Dấu lớn hơn/);assert.match(markup,/Dấu bé hơn/);assert.match(markup,/Dấu bằng/);
      assert.match(markup,/data-game-target-id="relation"/);assert.doesNotMatch(markup,/Xác nhận/);
    }else{assert.match(markup,/Xác nhận/);assert.match(markup,/Hoàn tác/);assert.match(markup,/data-game-target-id="inside"/);}
    assert.equal(currentVoiceInstruction(content,q.id),q.instruction);
  }
  assert.deepEqual(actions,[]);
  const runtime=renderToStaticMarkup(React.createElement(GameRuntime,{content,assetUrls,mode:"PREVIEW"}));
  assert.match(runtime,/data-scene-theme="forest"/);
  assert.match(runtime,/\/game-scenes\/forest\/background.png/);
  assert.doesNotMatch(runtime,/game-hint-button/);
});

test("correct comparison advances immediately; incorrect confirmation keeps the current task",()=>{
  const identity=()=>({eventId:crypto.randomUUID(),timestamp:new Date().toISOString()});
  const first=applyGameAction(content,createInitialState(content),{actionType:"COMPARE_QUANTITIES",sourceId:"compare",targetId:"LT"},identity());
  const wrong=applyGameAction(content,first.state,{actionType:"CONFIRM_QUANTITY_CHANGE",sourceId:"add",count:10},identity());
  assert.equal(wrong.interaction.result,"INCORRECT");
  assert.deepEqual(wrong.state.solvedQuestionIds,["compare"]);
  assert.equal(wrong.state.attemptCount,2);
});

test("authoring preserves requested difficulty and parses a model draft with three questions",async()=>{
  const source={gameType:content.gameType,prompt:"ô tô",comparisonDifficulty:"HARD"};
  assert.deepEqual(validateGameRequest(source),source);
  assert.throws(()=>validateGameRequest({...source,comparisonDifficulty:"INVALID"}));
  const game={gameType:content.gameType,gameContent:content,generation:{requestId:crypto.randomUUID(),model:"fixture",attempts:1,reviewRequired:true,warnings:[],validatedAt:new Date().toISOString(),preview:{token:"proof",expiresAt:new Date(Date.now()+100000).toISOString()}}};
  assert.equal(parseGeneratedGame(game,content.gameType).gameContent.questions.length,3);
  const controller=createGameCreationController({generate:async()=>game});
  assert.equal(await controller.generate(source),true);
  assert.equal(controller.getSnapshot().draft.difficulty,"HARD");
});

test("ocean actors resolve to existing GLB nodes; no guessed model URLs",()=>{
  for(const filename of new Set(OCEAN_ACTORS.map(a=>a.file))) {
    const file=readFileSync(new URL(`../public/models/landing/${filename}`,import.meta.url));
    assert.equal(file.toString('utf8',0,4),'glTF');
    const length=file.readUInt32LE(12);
    const doc=JSON.parse(file.toString('utf8',20,20+length));
    for(const actor of OCEAN_ACTORS.filter(a=>a.file===filename))assert.ok(doc.nodes.some(n=>n.name===actor.node),actor.node);
  }
});

test("minimal comparison UI has three dots, icon actions and no visible instructions or basket image",()=>{
  for(const [index] of content.questions.entries()) {
    const state={...createInitialState(content),solvedQuestionIds:content.questions.slice(0,index).map(q=>q.id)};
    const markup=renderToStaticMarkup(React.createElement(ComparisonChangeGame,{content,state,assetUrls,onAction:()=>{}}));
    assert.equal((markup.match(/<li\b/g)??[]).length,3);
    assert.doesNotMatch(markup,/src="\/basket.png"/);
    const visible=markup.replace(/<(p|span|h3)\b[^>]*class="sr-only"[^>]*>[\s\S]*?<\/\1>/g,'').replace(/<[^>]*>/g,'');
    assert.doesNotMatch(visible,/So sánh|Thêm|Bớt|Bé hãy|Hoàn tác|Làm lại|Xác nhận|Giỏ|Đồ vật/);
    if(index>0){assert.match(markup,/aria-label="Xác nhận"/);assert.match(markup,/aria-label="Làm lại màn này"/);}
  }
});

test("orca stays anchored at the bottom left; one recognizable penguin occupies the right edge",()=>{
  const orca=OCEAN_ACTORS.find(actor=>actor.node==='SM_Orca_below_surface');
  assert.equal(orca.anchor,'bottom-left');assert.equal(orca.speed,0);assert.ok(orca.yaw<0);
  assert.equal(OCEAN_PENGUIN.anchor,'bottom-right');assert.equal(OCEAN_PENGUIN.speed,0);
  const penguin=createOceanPenguin();
  assert.equal(penguin.name,'OceanPenguin');
  const box=new THREE.Box3().setFromObject(penguin),size=box.getSize(new THREE.Vector3());
  assert.ok(size.y>size.x&&size.x>0);
  const geometries=new Set(),materials=new Set();
  penguin.traverse(node=>{if(node.isMesh){geometries.add(node.geometry);materials.add(node.material);}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
});

test("partition layout removes the empty source tray when all objects are in baskets",()=>{
  const partition=gameContentSchema.parse({schemaVersion:1,gameType:"QUANTITY",mode:"SPLIT",instruction:"Tách quả",items:[{id:"a",assetId},{id:"b",assetId}],basketAssetId,baskets:[{id:"left",label:"Giỏ trái",requirements:[{assetId,count:1}]},{id:"right",label:"Giỏ phải",requirements:[{assetId,count:1}]}],completionRule:"ALL_BASKETS_FILLED"});
  const state={...createInitialState(partition),completed:true,placements:[{itemId:"a",basketId:"left"},{itemId:"b",basketId:"right"}]};
  const markup=renderToStaticMarkup(React.createElement(QuantityGame,{content:partition,state,assetUrls,onAction:()=>{}}));
  assert.doesNotMatch(markup,/class="quantity-source"/);
  assert.match(markup,/quantity-basket-front/);assert.match(markup,/quantity-nest-fruit/);
});
