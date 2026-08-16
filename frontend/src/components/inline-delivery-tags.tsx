import "./inline-delivery-tags.css"

const INLINE_TAG = /^\[[^\[\]\n]{1,40}\]$/

export function InlineDeliveryTags({ text }: { text: string }) {
  return <>{text.split(/(\[[^\[\]\n]{1,40}\])/g).map((fragment, index) => (
    INLINE_TAG.test(fragment)
      ? <mark className="inline-delivery-tag" key={index}>{fragment}</mark>
      : <span key={index}>{fragment}</span>
  ))}</>
}
