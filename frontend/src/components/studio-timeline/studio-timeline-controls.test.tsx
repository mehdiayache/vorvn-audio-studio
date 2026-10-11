// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {TimelineRuler} from './timeline-ruler'
import {TimelineTransport} from './timeline-transport'
import {TimelineContextBar} from './timeline-context-bar'
import {SoundSceneContextToolbar} from './sound-scene-context-toolbar'
import {SelectionVolumeControl} from './selection-volume-control'
beforeEach(()=>vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('shared actual Studio clock and selection controls',()=>{
  it('positions ruler marks, playhead, loop range and snap guide on the same second-based scale',()=>{
    const seek=vi.fn(),{container}=render(<TimelineRuler marks={[0,2,5]} pixelsPerSecond={40} playhead={3} playbackRange={{start:1,end:4}} snapGuide={2.5} onSeek={seek}/>)
    expect(screen.getByText('0:05').style.left).toBe('200px');expect(container.querySelector<HTMLElement>('.sound-scene-playhead')!.style.left).toBe('120px')
    expect(container.querySelector<HTMLElement>('.sound-scene-playback-range')!.style.cssText).toContain('left: 40px');expect(container.querySelector<HTMLElement>('.sound-scene-playback-range')!.style.width).toBe('120px')
    expect(container.querySelector<HTMLElement>('.sound-scene-snap-guide')!.style.left).toBe('100px');fireEvent.pointerDown(container.querySelector('.sound-scene-ruler')!);expect(seek).toHaveBeenCalledOnce()
  })
  it('uses exact timecodes and host playback state, with no session or autoplay on mount',()=>{
    const toggle=vi.fn(),{rerender}=render(<TimelineTransport duration={125.5} current={12.345} playing={false} available onToggle={toggle}/>)
    expect(screen.getByText('00:00:12.345')).toBeTruthy();expect(screen.getByText('00:02:05.500')).toBeTruthy();expect(toggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Play Timeline'}));expect(toggle).toHaveBeenCalledOnce()
    rerender(<TimelineTransport duration={125.5} current={125.5} playing available onToggle={toggle}/>);fireEvent.click(screen.getByRole('button',{name:'Pause Timeline'}));expect(toggle).toHaveBeenCalledTimes(2)
  })
  it('disables unavailable playback while preserving explicit host labels and bounded time',()=>{
    const toggle=vi.fn();render(<TimelineTransport duration={2} current={20} playing={false} available={false} onToggle={toggle} labels={{play:'Play composition'}}/>)
    expect(screen.getAllByText('00:00:02.000')).toHaveLength(2);fireEvent.click(screen.getByRole('button',{name:'Play composition'}));expect(toggle).not.toHaveBeenCalled()
  })
  it('uses one contextual selection footer with visual priority and a stable empty state',()=>{
    const {rerender}=render(<TimelineContextBar/>);expect(screen.getByLabelText('Selection actions').tagName).toBe('FOOTER');expect(screen.getByText('Select a clip or Script Part to edit it')).toBeTruthy()
    rerender(<TimelineContextBar audioToolbar={<b>Audio actions</b>} visualToolbar={<b>Visual actions</b>}/>);expect(screen.getByText('Visual actions')).toBeTruthy();expect(screen.queryByText('Audio actions')).toBeNull()
    rerender(<TimelineContextBar visualToolbar={false} audioToolbar={<b>Script mix</b>}/>);expect(screen.getByText('Script mix')).toBeTruthy();expect(screen.queryByText('Visual actions')).toBeNull()
  })
  it('exposes protected Script mix controls without independent placement operations or absent capabilities',()=>{
    const props={saving:false,onVolume:vi.fn(),onEffects:vi.fn()},{rerender}=render(<SoundSceneContextToolbar {...props} context={{kind:'sequence',label:'Narrator',muted:false,gain:1,effects:[]}}/>)
    expect(screen.getByRole('button',{name:'Part volume · 100%'})).toBeTruthy();expect(screen.getByRole('button',{name:'Effects'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Delete selected clips'})).toBeNull();expect(screen.queryByRole('button',{name:'Split at playhead'})).toBeNull()
    rerender(<SoundSceneContextToolbar {...props} context={{kind:'audio',label:'Music',muted:false,gain:1,effects:[]}}/>);expect(screen.getByRole('button',{name:'Clip volume · 100%'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Duplicate selected clips'})).toBeNull();expect(screen.queryByRole('button',{name:'More playback actions'})).toBeNull()
  })
  it('blocks an already-open volume popover after editing becomes disabled',()=>{
    const commit=vi.fn(),props={label:'Clip volume',detail:'Adjust selected clip',gain:.5,muted:false,onCommit:commit},{rerender}=render(<SelectionVolumeControl {...props}/>);
    fireEvent.click(screen.getByRole('button',{name:'Clip volume · 50%'}));expect(screen.getByRole('button',{name:'Mute Clip volume'})).toBeTruthy()
    rerender(<SelectionVolumeControl {...props} disabled/>);fireEvent.click(screen.getByRole('button',{name:'Mute Clip volume'}));fireEvent.click(screen.getByRole('button',{name:'Reset Clip volume to 100%'}));expect(commit).not.toHaveBeenCalled()
  })
})
