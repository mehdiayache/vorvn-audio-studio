// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, renderHook} from '@testing-library/react'
import {acceptsStudioTimelineShortcut, dispatchStudioTimelineShortcut, useStudioTimelineShortcuts, type StudioTimelineShortcutOptions} from './use-studio-timeline-shortcuts'

function options(changes: Partial<StudioTimelineShortcutOptions> = {}): StudioTimelineShortcutOptions {
  return {activeCancel:{current:null},hasAudioSelection:true,hasVisualSelection:false,canSplitVisual:false,canDeleteAudio:true,canDeleteVisual:true,
    undo:vi.fn(),redo:vi.fn(),duplicateAudio:vi.fn(),duplicateVisual:vi.fn(),splitAudio:vi.fn(),splitVisual:vi.fn(),playAudioSelection:vi.fn(),togglePlayback:vi.fn(),nudgeAudio:vi.fn(),nudgeVisual:vi.fn(),seekStart:vi.fn(),zoom:vi.fn(),clearSelection:vi.fn(),deleteAudio:vi.fn(),deleteVisual:vi.fn(),...changes}
}
function key(o: StudioTimelineShortcutOptions, key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', {key,bubbles:true,cancelable:true,...init})
  Object.defineProperty(event,'target',{value:target})
  return {event,handled:dispatchStudioTimelineShortcut(event,o)}
}
afterEach(()=>{cleanup();document.body.innerHTML='';vi.restoreAllMocks()})
describe('shared Studio Timeline keyboard ownership',()=>{
  it('routes command history, duplication, split, selected looping and real Space once',()=>{
    const o=options()
    for(const [k,init] of [['z',{metaKey:true}],['z',{ctrlKey:true,shiftKey:true}],['d',{metaKey:true}],['s',{}],['l',{metaKey:true}],[' ',{code:'Space'}]] as [string,KeyboardEventInit][]) expect(key(o,k,init).handled).toBe(true)
    expect(o.undo).toHaveBeenCalledOnce();expect(o.redo).toHaveBeenCalledOnce();expect(o.duplicateAudio).toHaveBeenCalledOnce();expect(o.splitAudio).toHaveBeenCalledOnce();expect(o.playAudioSelection).toHaveBeenCalledWith(true);expect(o.togglePlayback).toHaveBeenCalledOnce()
    expect(key(o,'Unidentified',{code:'Workspace'}).handled).toBe(false)
  })
  it('preserves precise 100ms, Shift 1000ms and Alt 10ms nudges, Home/0 and continuous zoom',()=>{
    const o=options()
    key(o,'ArrowLeft');key(o,'ArrowRight',{shiftKey:true});key(o,'ArrowRight',{altKey:true,shiftKey:true});key(o,'ArrowRight',{repeat:true})
    expect(vi.mocked(o.nudgeAudio).mock.calls).toEqual([[-100],[1000],[10],[100]])
    key(o,'Home');key(o,'0');expect(o.seekStart).toHaveBeenCalledTimes(2)
    for(const k of ['-','_','=','+'])key(o,k)
    expect(vi.mocked(o.zoom).mock.calls).toEqual([[-1],[-1],[1],[1]])
  })
  it('returns focus to the Timeline before deleting a focused clip so Undo still belongs to it',()=>{
    const timeline=document.createElement('section');timeline.tabIndex=0
    const clip=document.createElement('button');clip.dataset.timelineShortcutSurface='true';timeline.append(clip);document.body.append(timeline);clip.focus()
    const o=options({scope:{current:timeline},deleteAudio:()=>clip.remove()})
    expect(key(o,'Backspace',{},clip).handled).toBe(true)
    expect(document.activeElement).toBe(timeline)
    expect(key(o,'z',{metaKey:true},document.activeElement!).handled).toBe(true)
    expect(o.undo).toHaveBeenCalledOnce()
  })
  it('routes independent visual operations while video splitting requires eligibility',()=>{
    const o=options({hasAudioSelection:false,hasVisualSelection:true})
    expect(key(o,'s').handled).toBe(false);o.canSplitVisual=true
    key(o,'s');key(o,'d',{ctrlKey:true});key(o,'ArrowLeft',{altKey:true});key(o,'Delete');key(o,'Backspace')
    expect(o.splitVisual).toHaveBeenCalledOnce();expect(o.duplicateVisual).toHaveBeenCalledOnce();expect(o.nudgeVisual).toHaveBeenCalledWith(-10);expect(o.deleteVisual).toHaveBeenCalledTimes(2)
    expect(o.deleteAudio).not.toHaveBeenCalled();expect(key(o,'l',{ctrlKey:true}).handled).toBe(false)
  })
  it('clears a protected Script selection without exposing independent clip mutations',()=>{
    const o=options({hasAudioSelection:false,hasVisualSelection:false,hasSelection:true})
    for(const k of ['s','Delete','Backspace','ArrowRight'])expect(key(o,k).handled).toBe(false)
    expect(key(o,'d',{metaKey:true}).handled).toBe(false);expect(key(o,'l',{metaKey:true}).handled).toBe(false)
    expect(key(o,'Escape').handled).toBe(true);expect(o.clearSelection).toHaveBeenCalledOnce()
  })
  it('cancels an active gesture before clearing selection and leaves idle Escape for the shell',()=>{
    const cancel=vi.fn(),o=options({activeCancel:{current:cancel}})
    key(o,'Escape');expect(cancel).toHaveBeenCalledOnce();expect(o.clearSelection).not.toHaveBeenCalled()
    o.activeCancel.current=null;key(o,'Escape');expect(o.clearSelection).toHaveBeenCalledOnce()
    o.hasAudioSelection=false;expect(key(o,'Escape').handled).toBe(false)
  })
  it('prevents repeat from issuing duplicate mutations or playback toggles but permits repeated nudging',()=>{
    const o=options()
    for(const [k,init] of [['d',{metaKey:true}],['z',{ctrlKey:true}],['s',{}],['Delete',{}],[' ',{code:'Space'}]] as [string,KeyboardEventInit][])expect(key(o,k,{...init,repeat:true}).handled).toBe(true)
    expect(o.duplicateAudio).not.toHaveBeenCalled();expect(o.undo).not.toHaveBeenCalled();expect(o.splitAudio).not.toHaveBeenCalled();expect(o.deleteAudio).not.toHaveBeenCalled();expect(o.togglePlayback).not.toHaveBeenCalled()
    key(o,'ArrowRight',{repeat:true});expect(o.nudgeAudio).toHaveBeenCalledOnce()
  })
  it('keeps viewers playback and navigation usable while all document mutations are disabled',()=>{
    const o=options({editable:false})
    for(const k of ['s','Delete','Backspace','ArrowRight'])expect(key(o,k).handled).toBe(false)
    expect(key(o,'z',{metaKey:true}).handled).toBe(false);expect(key(o,'d',{metaKey:true}).handled).toBe(false)
    key(o,' ',{code:'Space'});key(o,'Home');key(o,'+');key(o,'l',{ctrlKey:true});expect(o.togglePlayback).toHaveBeenCalledOnce();expect(o.seekStart).toHaveBeenCalledOnce();expect(o.zoom).toHaveBeenCalledWith(1);expect(o.playAudioSelection).toHaveBeenCalledWith(true)
  })
  it('respects per-action locks, playback readiness and unavailable history',()=>{
    const o=options({canDuplicateAudio:false,canSplitAudio:false,canNudgeAudio:false,canDeleteAudio:false,canTogglePlayback:false,canUndo:false,canRedo:false})
    for(const k of ['s','ArrowRight','Delete','Backspace',' '])expect(key(o,k).handled).toBe(false)
    expect(key(o,'d',{ctrlKey:true}).handled).toBe(false);expect(key(o,'z',{ctrlKey:true}).handled).toBe(false);expect(key(o,'z',{ctrlKey:true,shiftKey:true}).handled).toBe(false)
  })
  it('never steals editing, sliders, buttons, tabs, nested menus or composed shadow controls',()=>{
    for(const markup of ['<input>','<textarea></textarea>','<button><span></span></button>','<a href="/cloud">Cloud</a>','<div contenteditable="plaintext-only"></div>','<div role="slider"><span></span></div>','<div role="combobox"></div>','<div role="tab"></div>','<div role="dialog"><div data-timeline-shortcut-surface="true"></div></div>','<div role="menu"><div></div></div>']){
      document.body.innerHTML=markup
      const target=document.body.firstElementChild!.lastElementChild??document.body.firstElementChild!
      expect(acceptsStudioTimelineShortcut(target)).toBe(false);expect(key(options(),'z',{metaKey:true},target).handled).toBe(false)
    }
    const host=document.createElement('div'),slider=document.createElement('span');slider.setAttribute('role','slider')
    const event=new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true});Object.defineProperty(event,'target',{value:host});Object.defineProperty(event,'composedPath',{value:()=>[slider,host,document.body,document,window]})
    expect(dispatchStudioTimelineShortcut(event,options())).toBe(false)
  })
  it('opts focused clip surfaces in while protecting their nested controls',()=>{
    const clip=document.createElement('button');clip.dataset.timelineShortcutSurface='true';const text=document.createElement('span');clip.append(text)
    expect(acceptsStudioTimelineShortcut(text)).toBe(true);expect(key(options(),'z',{ctrlKey:true},text).handled).toBe(true)
    const input=document.createElement('input');clip.append(input);expect(acceptsStudioTimelineShortcut(input)).toBe(false)
  })
  it('scopes global listeners to the active mounted Timeline and ignores accepted keys and IME input',()=>{
    const timeline=document.createElement('section');timeline.className='timeline-workspace';document.body.append(timeline)
    const cloud=document.createElement('section');document.body.append(cloud)
    const o=options({scope:{current:timeline}});renderHook(()=>useStudioTimelineShortcuts(o))
    fireEvent.keyDown(cloud,{key:'Delete'});expect(o.deleteAudio).not.toHaveBeenCalled()
    fireEvent.keyDown(timeline,{key:'Delete'});expect(o.deleteAudio).toHaveBeenCalledOnce()
    const prevented=new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true});prevented.preventDefault();timeline.dispatchEvent(prevented)
    fireEvent.keyDown(timeline,{key:'Delete',isComposing:true});expect(o.deleteAudio).toHaveBeenCalledOnce()
    o.active=false;fireEvent.keyDown(timeline,{key:'Delete'});expect(o.deleteAudio).toHaveBeenCalledOnce()
  })
  it('leaves Cloud search and browser command keys alone and yields to an open modal',()=>{
    const o=options()
    expect(key(o,'k',{metaKey:true}).handled).toBe(false);expect(key(o,'s',{metaKey:true}).handled).toBe(false);expect(key(o,'ArrowLeft',{metaKey:true}).handled).toBe(false)
    const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.dataset.state='open';document.body.append(dialog)
    expect(key(o,'Delete').handled).toBe(false);expect(o.deleteAudio).not.toHaveBeenCalled()
  })
})
