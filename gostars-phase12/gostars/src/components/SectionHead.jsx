export default function SectionHead({ title, lead, as: Tag = 'h2' }) {
  return (
    <div className="section-head">
      <Tag>{title}</Tag>
      {lead && <p>{lead}</p>}
    </div>
  )
}
