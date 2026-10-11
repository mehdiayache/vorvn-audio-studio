// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {TimelineTrackControls,type AudioTrackSessionPort,type VisualTrackSessionPort} from './timeline-track-controls'
import type {SoundSceneTrack,VisualSceneTrack} from './studio-timeline-model'
const audio:SoundSceneTrack={id:'music-track',kind:'audio',name:'Music',role:'music',volume:.4,muted:false,color:'coral',clips:[]}
const visual:VisualSceneTrack={id:'image-track',name:'Image',media_type:'image',visible:true,locked:false,color:'teal',clips:[]}
function fixture(collapsed=true,editable=true){
 const audioSession:AudioTrackSessionPort={addTrack:vi.fn(),commitTrackMix:vi.fn(),setTrackMix:vi.fn(),toggleTrackSolo:vi.fn(),renameTrack:vi.fn(),setTrackRole:vi.fn(),setTrackColor:vi.fn()},visualSession:VisualTrackSessionPort={addTrack:vi.fn(),setTrackVisible:vi.fn(),setTrackLocked:vi.fn(),moveTrack:vi.fn(),renameTrack:vi.fn(),setTrackColor:vi.fn()}
 const props={audioSession,visualSession,audioTracks:[audio],engineTracks:[{id:audio.id,volume:.4,clips:[]}],visualTracks:[visual],files:[],collapsed,editable,soloTrackIds:[],sequenceSummary:'1 Part',onCollapsedChange:vi.fn(),onAddAudio:vi.fn(),onAddVisual:vi.fn(),onRemoveAudioTrack:vi.fn(),onRemoveVisualTrack:vi.fn()}
 return {props,...render(<TimelineTrackControls {...props}/>)}
}
function menu(label:string){const trigger=screen.getByRole('button',{name:label});fireEvent.pointerDown(trigger,{button:0,ctrlKey:false,pointerId:1})}
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});class Pointer extends MouseEvent{pointerId=1;pointerType='mouse';isPrimary=true};vi.stubGlobal('PointerEvent',Pointer);Object.defineProperty(HTMLElement.prototype,'hasPointerCapture',{configurable:true,value:()=>false});Object.defineProperty(HTMLElement.prototype,'setPointerCapture',{configurable:true,value:()=>{}});Object.defineProperty(HTMLElement.prototype,'releasePointerCapture',{configurable:true,value:()=>{}});Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:()=>{}})});afterEach(()=>{cleanup();vi.unstubAllGlobals();document.documentElement.style.removeProperty('--primary')})
describe('recovered track identities and compact controls',()=>{
 it('retains stable per-track identities when controls collapse or the app accent changes',()=>{
  const view=fixture(),headers=view.container.querySelectorAll<HTMLElement>('.timeline-track-header'),colors=[...headers].map(header=>header.style.getPropertyValue('--track-color'))
  expect(colors).toHaveLength(3);expect(new Set(colors).size).toBe(3);expect(view.container.querySelector<HTMLElement>('.timeline-track-header.is-visual')?.dataset.trackColor).toBe('teal');expect(view.container.querySelector<HTMLElement>('.timeline-track-header.is-audio')?.dataset.trackColor).toBe('coral');expect(view.container.querySelector<HTMLElement>('.timeline-track-header.is-audio')?.title).toContain('Music · 0 clips · 40%')
  document.documentElement.style.setProperty('--primary','red');view.rerender(<TimelineTrackControls {...view.props} collapsed={false}/>);expect([...view.container.querySelectorAll<HTMLElement>('.timeline-track-header')].map(header=>header.style.getPropertyValue('--track-color'))).toEqual(colors);expect(screen.getByRole('button',{name:'Hide track controls'})).toBeTruthy()
 })
 it('keeps the compact header small while exposing precise volume and user color in its menu',()=>{
  const {props,container}=fixture();expect(container.querySelector('.timeline-track-header.is-audio .timeline-track-header-actions')?.children).toHaveLength(2)
  menu('Track actions for Music');expect(screen.getByRole('slider',{name:'Music volume'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Track color: blue'}));expect(props.audioSession.setTrackColor).toHaveBeenCalledWith(audio.id,'blue');expect(props.audioSession.commitTrackMix).not.toHaveBeenCalled()
 })
 it('cancels a visual track rename without saving the draft and closes an unchanged Enter',()=>{
  const {props}=fixture(false,true)
  fireEvent.doubleClick(screen.getByText('Image',{exact:true}));const input=screen.getByRole('textbox',{name:'Track name'});fireEvent.change(input,{target:{value:'Unwanted name'}});fireEvent.keyDown(input,{key:'Escape'});expect(props.visualSession.renameTrack).not.toHaveBeenCalled();expect(screen.queryByRole('textbox',{name:'Track name'})).toBeNull()
  fireEvent.doubleClick(screen.getByText('Image',{exact:true}));fireEvent.keyDown(screen.getByRole('textbox',{name:'Track name'}),{key:'Enter'});expect(props.visualSession.renameTrack).not.toHaveBeenCalled();expect(screen.queryByRole('textbox',{name:'Track name'})).toBeNull()
 })
 it('offers temporary Solo to read-only viewers even with compact track controls',()=>{
  const {props}=fixture(true,false);expect(screen.getByRole('button',{name:'Mute Music'}).hasAttribute('disabled')).toBe(true)
  const direct=screen.queryByRole('button',{name:'Solo Music'});if(direct)fireEvent.click(direct);else{menu('Track actions for Music');expect(screen.getByRole('menuitem',{name:'Mute'}).getAttribute('aria-disabled')).toBe('true');expect(screen.getByRole('slider',{name:'Music volume'}).closest('[data-slot="slider"]')?.hasAttribute('data-disabled')).toBe(true);fireEvent.click(screen.getByRole('menuitem',{name:'Solo track'}))}
  expect(props.audioSession.toggleTrackSolo).toHaveBeenCalledWith(audio.id);expect(props.audioSession.commitTrackMix).not.toHaveBeenCalled();expect(props.audioSession.setTrackColor).not.toHaveBeenCalled()
 })
})
