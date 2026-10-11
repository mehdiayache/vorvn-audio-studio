import {describe,expect,it} from "vitest"
import {SOUND_SCENE_ZOOM_LEVELS as levels,SOUND_SCENE_DEFAULT_SAMPLES_PER_PIXEL,soundSceneZoomIndex,soundSceneZoomLevel,soundSceneFitZoomIndex} from "./studio-timeline-zoom"

describe("actual historical Studio zoom scale",()=>{
 it("retains 48kHz limits, default and every historical 1.14 step",()=>{
  const historical=new Set([300,4800,96000])
  for(let value=4800/1.14;value>300;value/=1.14)historical.add(Math.round(value))
  for(let value=4800*1.14;value<96000;value*=1.14)historical.add(Math.round(value))
  expect(levels).toEqual([...historical].sort((a,b)=>a-b))
  expect(Object.isFrozen(levels)).toBe(true)
  expect(SOUND_SCENE_DEFAULT_SAMPLES_PER_PIXEL).toBe(4800)
  expect(48000/levels[0]!).toBe(160)
  expect(48000/levels.at(-1)!).toBe(.5)
 })
 it("indexes zoom from furthest to closest and bounds requested levels",()=>{
  for(const level of levels)expect(soundSceneZoomLevel(soundSceneZoomIndex(level))).toBe(level)
  expect(soundSceneZoomLevel(-200)).toBe(96000)
  expect(soundSceneZoomLevel(200)).toBe(300)
  expect(soundSceneZoomIndex(4799)).toBe(soundSceneZoomIndex(4800))
 })
 it("fits compositions without clipping, up to the historical longest view",()=>{
  for(const [duration,width] of [[0,800],[180,800],[1200,1400],[1,0],[-10,800]]){
   const level=soundSceneZoomLevel(soundSceneFitZoomIndex(duration!,width!))
   expect(level).toBeGreaterThanOrEqual(Math.max(300,Math.max(0,duration!)*48000/Math.max(1,width!)))
  }
  expect(soundSceneZoomLevel(soundSceneFitZoomIndex(86400,800))).toBe(96000)
 })
})
