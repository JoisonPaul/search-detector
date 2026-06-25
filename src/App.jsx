import { useState } from 'react'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  const analyze = async () => {
    if (!url) return
    let cleanUrl = url
    if (!/^https?:\/\//i.test(url)) cleanUrl = 'https://' + url

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setHistory(prev => [{ url: cleanUrl, provider: data.provider }, ...prev.slice(0, 4)])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const examples = ['https://www.rei.com', 'https://www.sephora.com', 'https://www.wayfair.com', 'https://www.psicompany.com']

  return (
    <div className="app">
      <div className="hero">
        <h1>Search Provider Detector</h1>
        <p>Find out which search technology any ecommerce website is using</p>
      </div>

      <div className="input-wrap">
        <input
          type="text"
          placeholder="https://www.example.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && analyze()}
        />
        <button onClick={analyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      <div className="examples">
        <span>Try:</span>
        {examples.map(ex => (
          <button key={ex} onClick={() => { setUrl(ex); }}>
            {ex.replace('https://www.', '')}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          <p>Fetching and analyzing {url}...</p>
        </div>
      )}

      {result && (
        <div className="result-card">
          <div className={`badge ${result.found ? 'badge-found' : 'badge-unknown'}`}>
            {result.found ? '✓ Provider Detected' : '? Unknown Provider'}
          </div>

          <h2>{result.provider}</h2>
          <p className="description">{result.description}</p>

          <div className="meta-grid">
            <div className="meta-box">
              <div className="meta-label">Category</div>
              <div className="meta-value">{result.category}</div>
            </div>
            <div className="meta-box">
              <div className="meta-label">Confidence</div>
              <div className="meta-value">{result.confidence}%</div>
            </div>
          </div>

          <div className="conf-bar">
            <div className="conf-label">Detection confidence</div>
            <div className="conf-track">
              <div
                className="conf-fill"
                style={{
                  width: `${result.confidence}%`,
                  background: result.confidence >= 70 ? '#1D9E75' : result.confidence >= 40 ? '#BA7517' : '#A32D2D'
                }}
              />
            </div>
          </div>

          {result.signals?.length > 0 && (
            <div className="signals">
              <div className="signals-title">Detection Signals</div>
              {result.signals.map((s, i) => <span key={i} className="tag">{s}</span>)}
            </div>
          )}

          {result.note && <p className="note">{result.note}</p>}

          {result.website && result.found && (
            <a href={result.website} target="_blank" rel="noreferrer" className="provider-link">
              Learn about {result.provider} →
            </a>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="history">
          <div className="history-title">Recent Searches</div>
          {history.map((h, i) => (
            <div key={i} className="history-item" onClick={() => setUrl(h.url)}>
              <span className="history-url">{h.url.replace('https://', '')}</span>
              <span className="history-provider">{h.provider}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App