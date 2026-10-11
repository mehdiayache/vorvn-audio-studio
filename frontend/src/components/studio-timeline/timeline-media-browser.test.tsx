// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from "@testing-library/react"
import {afterEach,describe,expect,it,vi} from "vitest"
import type {WorkspaceFile} from "../../types/domain"
import {createLibraryQuery,libraryFileSearchText,libraryFileType,queryLibraryFiles} from "../../features/library/library-query"
import {TimelineMediaBrowser as OriginalBrowser} from "../../features/productions/audiovisual/timeline/timeline-workbench"
import {visualTimelineFile} from "../../features/visual-scene/timeline/visual-timeline-parts"
import {TimelineMediaBrowser,queryStudioMedia,type StudioBrowserFile} from "./timeline-media-browser"

afterEach(cleanup)
const files:WorkspaceFile[]=[
 {id:1,name:"Hero",filename:"hero.webp",media_type:"image",source:"uploaded",tags:["launch"],metadata:{source_tags:["mountain"]},created_at:"2026-01-03T00:00:00Z"},
 {id:2,name:"Narration",filename:"narration.wav",media_type:"audio",mime_type:"audio/wav",tags:["voice"],source:"generated",created_at:"2026-01-02T00:00:00Z"},
 {id:3,name:"Theme",filename:"theme.mp3",media_type:"audio",category:"intro",source:"uploaded",created_at:"2026-01-02T00:00:00Z"},
 {id:4,name:"Ambience",filename:"forest.wav",media_type:"audio",category:"ambience",source:"freesound",metadata:{source_tags:["wind"]},updated_at:"2026-01-01T00:00:00Z"},
 {id:5,name:"Video",filename:"video.mp4",media_type:"video",created_at:"invalid"},
 {id:6,name:"Transcript",filename:"transcript.srt",media_type:"subtitle"},
 {id:7,name:"Audio",media_type:"audio"},
 {id:8,name:"Brief",media_type:"document"},
]
const normalize=(file:WorkspaceFile):StudioBrowserFile=>({...visualTimelineFile(file),category:file.category,source:file.source,tags:file.tags,searchText:libraryFileSearchText(file),libraryType:libraryFileType(file),createdAt:file.created_at||file.updated_at||null})
const normalized=files.map(normalize),productionIds=new Set([1,3,4,6])
describe("original Timeline media query boundary",()=>{
 it("matches actual LibraryQuery across all search, scope, type and recent-order states",()=>{
  for(const scope of ["production","workspace"] as const)for(const media of ["all","audio","image","video"] as const)for(const query of [""," launch ","MOUNTAIN","forest.wav","audio/wav","generated","wind","intro","srt"]){
   const expected=queryLibraryFiles(files,createLibraryQuery({scope,type:media,search:query}),{productionFileIds:productionIds}).map(file=>file.id)
   expect(queryStudioMedia(normalized,scope,media,query,productionIds).map(file=>file.id),`${scope}/${media}/${query}`).toEqual(expected)
  }
 })
 it("preserves pin-string identity and input order for equal-time host descriptors",()=>{
  const descriptors:StudioBrowserFile[]=[{id:"pin:b:4",name:"Wind",media_type:"audio",tags:["weather"]},{id:"pin:a:2",name:"Storm",media_type:"audio",tags:["weather"]}]
  expect(queryStudioMedia(descriptors,"workspace","audio","weather",new Set()).map(file=>file.id)).toEqual(["pin:b:4","pin:a:2"])
 })
 it("retains original File identity through source search, preview and add",()=>{
  const onPreview=vi.fn(),onAdd=vi.fn()
  render(<OriginalBrowser files={files} productionFileIds={[1]} usedFileIds={[]} collapsed={false} onCollapsedChange={vi.fn()} onPreview={onPreview} onAdd={onAdd}/> )
  fireEvent.change(screen.getByPlaceholderText("Search media"),{target:{value:"mountain"}})
  fireEvent.click(screen.getByRole("button",{name:"Preview Hero"}))
  expect(onPreview).toHaveBeenCalledWith(files[0])
  expect(onPreview.mock.calls[0]![0]).toBe(files[0])
  fireEvent.click(screen.getByRole("button",{name:"Add Hero at playhead"}))
  expect(onAdd.mock.calls[0]![0]).toBe(files[0])
 })
 it("keeps Browse Files within the header actions and the original five-row grid",()=>{
  const onBrowse=vi.fn()
  const props={files:normalized,productionFileIds:[1],usedFileIds:[],collapsed:false,onCollapsedChange:vi.fn(),onPreview:vi.fn(),onAdd:vi.fn(),onBrowse}
  const {container,rerender}=render(<TimelineMediaBrowser {...props}/>)
  const browse=screen.getByRole("button",{name:"Browse Files"})
  expect(browse.closest(".workstation-pane-header")).toBeTruthy()
  expect(container.querySelector(".timeline-media-browser")?.children).toHaveLength(5)
  fireEvent.click(browse);expect(onBrowse).toHaveBeenCalledOnce()
  rerender(<TimelineMediaBrowser {...props} disabled/>)
  expect((screen.getByRole("button",{name:"Browse Files"}) as HTMLButtonElement).disabled).toBe(true)
 })
 it("shows actionable loading/error states without a misleading empty result",()=>{
  const onRetry=vi.fn()
  const props={files:[],productionFileIds:[],usedFileIds:[],collapsed:false,onCollapsedChange:vi.fn(),onPreview:vi.fn(),onAdd:vi.fn()}
  const {rerender}=render(<TimelineMediaBrowser {...props} loading />)
  expect(screen.getByRole("status").textContent).toContain("Loading media")
  expect(screen.queryByText("No matching media")).toBeNull()
  rerender(<TimelineMediaBrowser {...props} error onRetry={onRetry}/>)
  expect(screen.queryByText("No matching media")).toBeNull()
  fireEvent.click(screen.getByRole("button",{name:"Retry"}))
  expect(onRetry).toHaveBeenCalledOnce()
 })
})
