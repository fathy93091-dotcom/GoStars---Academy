import { Link } from 'react-router-dom'
import { useContent } from '../content/ContentContext.jsx'
import usePageTitle from '../hooks/usePageTitle.js'
import SectionHead from '../components/SectionHead.jsx'
import Icon from '../components/Icon.jsx'

const featureIcons = ['teacher', 'report', 'group', 'chart']
const programIcons = ['book', 'calc', 'flask']

export default function Home() {
  const { c, img, size, show } = useContent()
  usePageTitle('')

  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <span className="badge">{c('home.hero.badge')}</span>
            <h1 style={{ marginTop: 14 }}>{c('home.hero.title')}</h1>
            <p className="tagline">{c('site.tagline')}</p>
            <p className="hero__lead">{c('home.hero.lead')}</p>
            <div className="hero__actions">
              <Link to="/programs" className="btn">{c('home.hero.cta1')}</Link>
              <Link to="/contact" className="btn btn--gold">{c('home.hero.cta2')}</Link>
            </div>
          </div>
          <div className="hero__art">
            <img className={`cms-img--${size('home.hero.image')}`} src={img('home.hero.image') || '/logo-mark.png'} alt="" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead title={c('home.features.title')} lead={c('home.features.lead')} />
          <div className="grid grid--4">
            {[1, 2, 3, 4].filter(n => show(`home.features.${n}.title`)).map(n => (
              <div className="card card--accent feature" key={n}>
                <span className="icon-bubble"><Icon name={featureIcons[n - 1]} /></span>
                <h3>{c(`home.features.${n}.title`)}</h3>
                <p>{c(`home.features.${n}.text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <SectionHead title={c('home.programs.title')} lead={c('home.programs.lead')} />
          <div className="grid">
            {[1, 2, 3].filter(n => show(`programs.${n}.title`)).map(n => (
              <Link to="/programs" className="card card--link" key={n}>
                <span className="icon-bubble icon-bubble--gold"><Icon name={programIcons[n - 1]} /></span>
                <h3>{c(`programs.${n}.title`)}</h3>
                <p>{c(`programs.${n}.text`)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="cta">
            <div>
              <h2>{c('home.cta.title')}</h2>
              <p>{c('home.cta.text')}</p>
            </div>
            <Link to="/contact" className="btn btn--gold">{c('home.cta.button')}</Link>
          </div>
        </div>
      </section>
    </>
  )
}
