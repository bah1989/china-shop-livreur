import { useCallback, useEffect, useState } from 'react'

const LIVREUR_API = 'https://beoeatxlyddmouruqotg.supabase.co/functions/v1/livreur-api'

const COLORS = {
  emerald: '#0A5C36',
  emeraldDark: '#173404',
  orange: '#FF6B00',
  bg: '#F8F9FA',
  card: '#FFFFFF',
  border: '#EAEAEA',
  textMuted: '#5F5E5A',
  textFaint: '#9A9A96',
}

async function call(action, payload) {
  const resp = await fetch(LIVREUR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  })
  const data = await resp.json()
  if (data.error) throw new Error(data.error)
  return data
}

export default function App() {
  const [partner, setPartner] = useState(null)
  const [phone, setPhone] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState(null)

  const [available, setAvailable] = useState([])
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [actingId, setActingId] = useState(null)
  const [togglingDuty, setTogglingDuty] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('china-shop-livreur')
    if (saved) {
      try {
        setPartner(JSON.parse(saved))
      } catch {}
    }
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setLoginBusy(true)
    setLoginError(null)
    try {
      const result = await call('login', { phone: phone.trim() })
      setPartner(result.partner)
      localStorage.setItem('china-shop-livreur', JSON.stringify(result.partner))
    } catch (e) {
      setLoginError(e.message)
    } finally {
      setLoginBusy(false)
    }
  }

  function handleLogout() {
    setPartner(null)
    localStorage.removeItem('china-shop-livreur')
  }

  const refresh = useCallback(async () => {
    if (!partner) return
    setLoading(true)
    setError(null)
    try {
      const result = await call('list_orders', { partner_id: partner.id })
      setAvailable(result.available || [])
      setMine(result.mine || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [partner])

  useEffect(() => {
    if (!partner) return
    refresh()
    const interval = setInterval(refresh, 15000)
    return () => clearInterval(interval)
  }, [partner, refresh])

  async function toggleDuty() {
    if (!partner) return
    setTogglingDuty(true)
    const onDuty = partner.status !== 'on_duty'
    try {
      await call('toggle_duty', { partner_id: partner.id, on_duty: onDuty })
      const updated = { ...partner, status: onDuty ? 'on_duty' : 'active' }
      setPartner(updated)
      localStorage.setItem('china-shop-livreur', JSON.stringify(updated))
    } catch (e) {
      setError(e.message)
    } finally {
      setTogglingDuty(false)
    }
  }

  async function claimOrder(orderId) {
    setActingId(orderId)
    setError(null)
    try {
      await call('claim_order', { partner_id: partner.id, order_id: orderId })
      await refresh()
    } catch (e) {
      setError(e.message)
      await refresh()
    } finally {
      setActingId(null)
    }
  }

  async function markDelivered(orderId) {
    setActingId(orderId)
    setError(null)
    try {
      const result = await call('mark_delivered', { partner_id: partner.id, order_id: orderId })
      const updated = { ...partner, wallet_balance: result.wallet_balance }
      setPartner(updated)
      localStorage.setItem('china-shop-livreur', JSON.stringify(updated))
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setActingId(null)
    }
  }

  if (!partner) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.bg, padding: 20 }}>
        <form onSubmit={handleLogin} style={{ background: COLORS.card, borderRadius: 16, padding: 28, width: '100%', maxWidth: 340, border: `1px solid ${COLORS.border}` }}>
          <p style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: COLORS.emerald }}>China Shop</p>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: COLORS.textMuted }}>Espace livreur</p>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Votre numéro de téléphone"
            style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
          />
          {loginError && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#C0392B' }}>{loginError}</p>}
          <button
            type="submit"
            disabled={loginBusy}
            style={{ width: '100%', background: COLORS.orange, color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontSize: 14, fontWeight: 600, opacity: loginBusy ? 0.6 : 1 }}
          >
            {loginBusy ? 'Connexion…' : 'Se connecter'}
          </button>
          <p style={{ margin: '14px 0 0', fontSize: 11, color: COLORS.textFaint, textAlign: 'center', lineHeight: 1.5 }}>
            Votre numéro doit être enregistré et validé par l'administrateur pour accéder à l'application.
          </p>
        </form>
      </div>
    )
  }

  const onDuty = partner.status === 'on_duty'

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg }}>
      <div style={{ maxWidth: 460, margin: '0 auto', minHeight: '100vh' }}>
        <div style={{ background: COLORS.card, padding: '16px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.emerald }}>{partner.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.textMuted }}>{partner.communes?.name}</p>
            </div>
            <span onClick={handleLogout} style={{ fontSize: 12, color: COLORS.textFaint, cursor: 'pointer', textDecoration: 'underline' }}>Déconnexion</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: COLORS.emeraldDark, borderRadius: 12, padding: '10px 12px' }}>
              <p style={{ margin: 0, fontSize: 10, color: '#C0DD97' }}>Portefeuille</p>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{Number(partner.wallet_balance || 0).toLocaleString('fr-FR')} FCFA</p>
            </div>
            <button
              onClick={toggleDuty}
              disabled={togglingDuty}
              style={{
                flex: 1, borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 700,
                background: onDuty ? '#EAF3DE' : COLORS.orange,
                color: onDuty ? COLORS.emerald : '#fff',
                opacity: togglingDuty ? 0.6 : 1,
              }}
            >
              {onDuty ? '🟢 En service' : '⚪ Hors service'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ background: '#FFF3E0', color: '#8A4B00', fontSize: 12, padding: '10px 16px' }}>{error}</div>
        )}

        <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Mes courses en cours</p>
          <span onClick={refresh} style={{ fontSize: 12, color: COLORS.emerald, cursor: 'pointer' }}>{loading ? 'Actualisation…' : '↻ Actualiser'}</span>
        </div>

        <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mine.length === 0 && (
            <p style={{ fontSize: 12, color: COLORS.textFaint, padding: '6px 0' }}>Aucune course en cours</p>
          )}
          {mine.map((o) => (
            <div key={o.id} style={{ background: COLORS.card, borderRadius: 14, border: `1px solid ${COLORS.emerald}`, padding: 14 }}>
              <OrderSummary order={o} />
              <button
                onClick={() => markDelivered(o.id)}
                disabled={actingId === o.id}
                style={{ width: '100%', marginTop: 10, background: COLORS.emerald, color: '#fff', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, opacity: actingId === o.id ? 0.6 : 1 }}
              >
                {actingId === o.id ? 'Validation…' : '✔ Marquer comme livré (+1 500 FCFA)'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 16px 0' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Courses disponibles</p>
        </div>

        <div style={{ padding: '10px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {available.length === 0 && (
            <p style={{ fontSize: 12, color: COLORS.textFaint, padding: '6px 0' }}>Aucune course disponible pour le moment</p>
          )}
          {available.map((o) => (
            <div key={o.id} style={{ background: COLORS.card, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: 14 }}>
              <OrderSummary order={o} />
              <button
                onClick={() => claimOrder(o.id)}
                disabled={actingId === o.id}
                style={{ width: '100%', marginTop: 10, background: COLORS.orange, color: '#fff', border: 'none', borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 700, opacity: actingId === o.id ? 0.6 : 1 }}
              >
                {actingId === o.id ? 'Prise en charge…' : 'Prendre en charge cette course'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderSummary({ order }) {
  const isExpress = order.delivery_type === 'express'
  const isExpedition = order.delivery_type === 'expedition'
  const destination = isExpedition ? order.villes?.name : order.communes?.name
  const accent = isExpedition ? '#1E88E5' : isExpress ? COLORS.orange : COLORS.emerald
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>
          {isExpedition
            ? `🚚 Expédition${destination ? ` — ${destination}` : ''}`
            : isExpress
              ? `⚡ Express${order.express_distance_km ? ` — ${order.express_distance_km} km` : ''}`
              : `📦 Standard${destination ? ` — ${destination}` : ''}`}
        </span>
        <span style={{ fontSize: 11, color: COLORS.textFaint }}>
          {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: COLORS.textMuted }}>{order.items_count} article{order.items_count > 1 ? 's' : ''}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#2C2C2A' }}>{Number(order.total_amount).toLocaleString('fr-FR')} FCFA</span>
      </div>

      <div style={{ background: '#F8F9FA', borderRadius: 10, padding: 10, marginBottom: 6 }}>
        {order.delivery_phone && (
          <a
            href={`tel:${order.delivery_phone}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.emerald, fontWeight: 600, textDecoration: 'none', marginBottom: 6 }}
          >
            📞 {order.delivery_phone}
          </a>
        )}
        {isExpedition ? (
          <p style={{ margin: 0, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.4 }}>📦 À déposer à l'agence de transport vers {destination || 'la ville de destination'}</p>
        ) : (
          order.delivery_address && (
            <p style={{ margin: 0, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.4 }}>📍 {order.delivery_address}</p>
          )
        )}
        {order.delivery_lat && order.delivery_lng && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${order.delivery_lat},${order.delivery_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 6, fontSize: 12, color: COLORS.orange, fontWeight: 600, textDecoration: 'underline' }}
          >
            Voir la position exacte sur la carte ↗
          </a>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 11, color: '#8A4B00' }}>💵 À encaisser en espèces {isExpedition ? "à l'agence" : 'à la livraison'}</p>
    </div>
  )
    }
