import { useContent } from '../content/ContentContext.jsx'
import usePageTitle from '../hooks/usePageTitle.js'
import SectionHead from '../components/SectionHead.jsx'
import Icon from '../components/Icon.jsx'

export default function About() {
  const { c, img, size, show } = useContent()
  usePageTitle(c('about.title'))

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHead as="h1" title={c('about.title')} lead={c('about.lead')} />
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div>
            <h2>{c('about.story.title')}</h2>
            <p>{c('about.story.text')}</p>
          </div>
          <div className="split__art">
            <img className={`cms-img--${size('about.story.image')}`} src={img('about.story.image') || '/logo-full.png'} alt="" />
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container grid">
          <div className="card card--accent">
            <h3>{c('about.vision.title')}</h3>
            <p>{c('about.vision.text')}</p>
          </div>
          <div className="card card--accent">
            <h3>{c('about.mission.title')}</h3>
            <p>{c('about.mission.text')}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead title={c('about.values.title')} />
          <div className="grid">
            {[1, 2, 3].filter(n => show(`about.values.${n}.title`)).map(n => (
              <div className="card" key={n}>
                <span className="icon-bubble"><Icon name="star" /></span>
                <h3>{c(`about.values.${n}.title`)}</h3>
                <p>{c(`about.values.${n}.text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
