import { useEffect } from 'react'

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | أكاديمية GoStars` : 'أكاديمية GoStars'
  }, [title])
}
