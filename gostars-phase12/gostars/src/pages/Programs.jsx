import { Link } from 'react-router-dom'
import { useContent } from '../content/ContentContext.jsx'
import usePageTitle from '../hooks/usePageTitle.js'
import SectionHead from '../components/SectionHead.jsx'
import Icon from '../components/Icon.jsx'

const programIcons = ['book', 'calc', 'flask']
const studyIcons = ['user', 'group']

export default function Programs() {
  const { c, show } = useContent()
  usePageTitle(c('programs.title'))

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <SectionHead as="h1" title={c('programs.title')} lead={c('programs.lead')} />
        </div>
      </section>

      <section className="section">
        <div className="container grid">
          {[1, 2, 3].filter(n => show(`programs.${n}.title`)).map(n => (
            <div className="card card--accent" key={n}>
              <span className="icon-bubble icon-bubble--gold"><Icon name={programIcons[n - 1]} /></span>
              <h3>{c(`programs.${n}.title`)}</h3>
              <p>{c(`programs.${n}.text`)}</p>
              <span className="badge">{c(`programs.${n}.tags`)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section section--tint">
        <div className="container">
          <SectionHead title={c('study.title')} />
          <div className="grid">
            {[1, 2].filter(n => show(`study.${n}.title`)).map(n => (
              <div className="card" key={n}>
                <span className="icon-bubble"><Icon name={studyIcons[n - 1]} /></span>
                <h3>{c(`study.${n}.title`)}</h3>
                <p>{c(`study.${n}.text`)}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <Link to="/contact" className="btn">{c('home.cta.button')}</Link>
          </div>
        </div>
      </section>
    </>
  )
}
