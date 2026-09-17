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
      setActing
