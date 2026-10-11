// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import type {WorkspaceFile} from '@/types/domain'
import {TimelineMediaBrowser} from '../timeline/timeline-workbench'

afterEach(cleanup)
it('normalizes nullable presentation metadata while returning the original numeric File to host actions',async()=>{
 const file:WorkspaceFile={id:41,name:'Rain',title:null,filename:null,media_type:'audio',category:null,duration_ms:null,url:null,metadata:{origin:'uploaded',original_filename:'Rain.wav'}}
 const preview=vi.fn(),add=vi.fn(async(_file:WorkspaceFile)=>{})
 render(<TimelineMediaBrowser files={[file]} productionFileIds={[41]} usedFileIds={[]} collapsed={false} onCollapsedChange={vi.fn()} onPreview={preview} onAdd={add}/>)
 fireEvent.click(screen.getByRole('button',{name:'Preview Rain'}))
 expect(preview).toHaveBeenCalledExactlyOnceWith(file)
 expect(preview.mock.calls[0]![0]).toBe(file)
 fireEvent.click(screen.getByRole('button',{name:'Add Rain at playhead'}))
 await waitFor(()=>expect(add).toHaveBeenCalledExactlyOnceWith(file))
 expect(add.mock.calls[0]![0]).toBe(file)
 expect(document.querySelector('[data-file-source="uploaded"]')).toBeTruthy()
})
it('retains the original source host catalogue scope and searches normalized names',()=>{
 const files:WorkspaceFile[]=[{id:1,name:'Production image',media_type:'image'},{id:2,name:'Workspace video',media_type:'video'}]
 render(<TimelineMediaBrowser files={files} productionFileIds={[1]} usedFileIds={[]} collapsed={false} onCollapsedChange={vi.fn()} onPreview={vi.fn()} onAdd={vi.fn()}/>)
 expect(screen.getByRole('button',{name:'This Production'}).getAttribute('aria-pressed')).toBe('true')
 expect(screen.queryByRole('button',{name:'Preview Workspace video'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Workspace'}))
 fireEvent.change(screen.getByPlaceholderText('Search media'),{target:{value:'video'}})
 expect(screen.getByRole('button',{name:'Preview Workspace video'})).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Preview Production image'})).toBeNull()
})
