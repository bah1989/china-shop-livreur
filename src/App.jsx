import { useEffect, useMemo, useState } from 'react'
import { supabase, FUNCTIONS_URL } from './supabaseClient'
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
function tierFor(itemsCount, deliveryType) {
if (deliveryType === 'expedition') {
if (itemsCount <= 1) return { deliveryFee: 500, useWholesale: itemsCount >= 2, label: 'Tarif fixe expédition : 500 FCFA (1 article)' }
if (itemsCount <= 5) return { deliveryFee: 2000, useWholesale: true, label: 'Tarif fixe expédition : 2 000 FCFA (2 à 5 articles)' }
return { deliveryFee: 2500, useWholesale: true, label: 'Tarif fixe expédition : 2 500 FCFA (plus de 5 articles)' }
}
if (itemsCount <= 1) return { deliveryFee: 1500, useWholesale: false, label: itemsCount === 1 ? 'Ajoutez 1 article pour débloquer le tarif de gros' : 'Ajoutez des articles au panier' }
if (itemsCount === 2) return { deliveryFee: 1000, useWholesale: true, label: 'Prix de gros débloqué. Encore un peu pour réduire la livraison' }
if (itemsCount <= 4) return { deliveryFee: 500, useWholesale: true, label: 'Livraison à 500 FCFA. Encore un peu pour la livraison gratuite' }
return { deliveryFee: 0, useWholesale: true, label: 'Statut VIP débloqué. Livraison 100% gratuite' }
}
export default function App() {
const [view, setView] = useState('catalog')
const [session, setSession] = useState(null)
const [ready, setReady] = useState(false)
const [communes, setCommunes] = useState([])
const [commune, setCommune] = useState(null)
const [villes, setVilles] = useState([])
const [ville, setVille] = useState(null)
const [products, setProducts] = useState([])
const [cart, setCart] = useState({}) // productId -> qty
const [order, setOrder] = useState(null) // { id, subtotal, deliveryFee, total }
const [error, setError] = useState(null)
const [busy, setBusy] = useState(false)
const [search, setSearch] = useState('')
const [deliveryType, setDeliveryType] = useState('standard')
const [locating, setLocating] = useState(false)
const [selectedProduct, setSelectedProduct] = useState(null)
const [deliveryPhone, setDeliveryPhone] = useState('')
const [deliveryAddress, setDeliveryAddress] = useState('')
useEffect(() => {
async function init() {
const { data: cData } = await supabase.from('communes').select('*').order('name')
setCommunes(cData || [])
setCommune(cData?.[0] || null)
const { data: vData } = await supabase.from('villes').select('*').eq('is_active', true).order('name')
setVilles(vData || [])
const { data: pData } = await supabase.from('products').select('*').eq('is_active', true).order('created_at')
setProducts(pData || [])
const params = new URLSearchParams(window.location.search)
const productIdFromUrl = params.get('p')
if (productIdFromUrl) {
const found = (pData || []).find((p) => p.id === productIdFromUrl)
if (found) setSelectedProduct(found)
}
let { data: authData } = await supabase.auth.getSession()
let currentSession = authData?.session
if (!currentSession) {
const { data, error } = await supabase.auth.signInAnonymously()
if (error) {
setError("La connexion anonyme n'est pas activée sur ce projet Supabase (Dashboard → Authentication → Providers → Anonymous). Le catalogue reste consultable, mais la commande ne pourra pas être validée tant que ce n'est pas activé.")
} else {
currentSession = data.session
}
}
setSession(currentSession || null)
if (currentSession && cData?.[0]) {
await supabase.from('users').upsert({
id: currentSession.user.id,
commune_id: cData[0].id,
role: 'client',
})
}
setReady(true)
}
init()
}, [])
const itemsCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart])
const tier = tierFor(itemsCount, deliveryType)
const cartLines = useMemo(() => {
return Object.entries(cart)
.filter(([, qty]) => qty > 0)
.map(([pid, qty]) => {
const p = products.find((x) => x.id === pid)
if (!p) return null
const unit = tier.useWholesale ? p.wholesale_price : p.retail_price
return { product: p, qty, unit, lineTotal: unit * qty }
})
.filter(Boolean)
}, [cart, products, tier.useWholesale])
const subtotal = cartLines.reduce((sum, l) => sum + l.lineTotal, 0)
const total = subtotal + tier.deliveryFee
const filteredProducts = useMemo(() => {
const q = search.trim().toLowerCase()
if (!q) return products
return products.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
}, [products, search])
function addToCart(productId, qty = 1) {
setCart((c) => ({ ...c, [productId]: (c[productId] || 0) + qty }))
}
function decFromCart(productId) {
setCart((c) => {
const next = { ...c }
next[productId] = Math.max(0, (next[productId] || 0) - 1)
return next
})
}
function getLocation() {
return new Promise((resolve, reject) => {
if (!navigator.geolocation) {
reject(new Error('Géolocalisation non disponible sur cet appareil'))
return
}
navigator.geolocation.getCurrentPosition(
(pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
() => reject(new Error("Impossible d'obtenir votre position — autorisez la localisation pour la livraison express")),
{ enableHighAccuracy: true, timeout: 10000 }
)
})
}
async function handleValidateOrder() {
if (!session) {
setError("Connexion anonyme indisponible — activez-la dans Supabase pour tester la commande complète.")
return
}
if (!deliveryPhone.trim()) {
setError('Merci de renseigner votre numéro de téléphone.')
return
}
if (deliveryType === 'expedition' && !ville) {
setError('Merci de choisir votre ville de destination.')
return
}
if (deliveryType !== 'expedition' && !deliveryAddress.trim()) {
setError('Merci de renseigner votre adresse/repère de livraison.')
return
}
setBusy(true)
setError(null)
try {
let deliveryCoords = null
if (deliveryType === 'express') {
setLocating(true)
try {
deliveryCoords = await getLocation()
} finally {
setLocating(false)
}
}
const { data: newOrder, error: orderErr } = await supabase
.from('orders')
.insert({
user_id: session.user.id,
commune_id: deliveryType === 'expedition' ? null : commune.id,
ville_id: deliveryType === 'expedition' ? ville.id : null,
status: 'pending',
payment_method: 'cash_on_delivery',
delivery_type: deliveryType,
delivery_lat: deliveryCoords?.lat ?? null,
delivery_lng: deliveryCoords?.lng ?? null,
delivery_phone: deliveryPhone.trim(),
delivery_address: deliveryType === 'expedition' ? null : deliveryAddress.trim(),
})
.select()
.single()
if (orderErr) throw orderErr
const rows = cartLines.map((l) => ({
order_id: newOrder.id,
product_id: l.product.id,
quantity: l.qty,
unit_price_applied: l.unit,
}))
const { error: itemsErr } = await supabase.from('order_items').insert(rows)
if (itemsErr) throw itemsErr
const calcResp = await fetch(`${FUNCTIONS_URL}/calculate-cart`, {
method: 'POST',
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
body: JSON.stringify({ order_id: newOrder.id }),
})
const calc = await calcResp.json()
if (calc.error) throw new Error(calc.error)
const resp = await fetch(`${FUNCTIONS_URL}/validate-payment`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
order_id: newOrder.id,
payment_ref: 'COD',
status: 'ACCEPTED',
}),
})
const result = await resp.json()
if (result.error) throw new Error(result.error)
setOrder({ id: newOrder.id, total: calc.total, deliveryType, expressDistanceKm: calc.expressDistanceKm, villeName: ville?.name })
setView('tracking')
setCart({})
setDeliveryType('standard')
setDeliveryPhone('')
setDeliveryAddress('')
setVille(null)
} catch (e) {
setError(e.message || String(e))
} finally {
setBusy(false)
}
}
if (!ready) {
return (
<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.emerald }}>
Chargement de China Shop…
</div>
)
}
return (
<div style={{ minHeight: '100vh', background: COLORS.bg }}>
<div style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', background: COLORS.bg, position: 'relative', paddingBottom: 24 }}>
{error && (
<div style={{ background: '#FFF3E0', color: '#8A4B00', fontSize: 12, padding: '10px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
{error}
</div>
)}
{view === 'catalog' && (
<CatalogScreen
communes={communes}
commune={commune}
setCommune={setCommune}
products={filteredProducts}
cart={cart}
itemsCount={itemsCount}
total={total}
addToCart={addToCart}
goCart={() => setView('cart')}
search={search}
setSearch={setSearch}
selectedProduct={selectedProduct}
setSelectedProduct={setSelectedProduct}
/>
)}
{view === 'cart' && (
<CartScreen
cartLines={cartLines}
itemsCount={itemsCount}
tier={tier}
subtotal={subtotal}
total={total}
addToCart={addToCart}
decFromCart={decFromCart}
onBack={() => setView('catalog')}
onValidate={handleValidateOrder}
busy={busy}
deliveryType={deliveryType}
setDeliveryType={setDeliveryType}
locating={locating}
deliveryPhone={deliveryPhone}
setDeliveryPhone={setDeliveryPhone}
deliveryAddress={deliveryAddress}
setDeliveryAddress={setDeliveryAddress}
villes={villes}
ville={ville}
setVille={setVille}
/>
)}
{view === 'tracking' && (
<TrackingScreen
total={order?.total}
deliveryType={order?.deliveryType}
expressDistanceKm={order?.expressDistanceKm}
villeName={order?.villeName}
onNewOrder={() => setView('catalog')}
/>
)}
</div>
</div>
)
}
function shareProduct(product) {
const text = `${product.name} — ${product.wholesale_price.toLocaleString('fr-FR')} FCFA sur China Shop !`
const url = `${window.location.origin}${window.location.pathname}?p=${product.id}`
if (navigator.share) {
navigator.share({ title: product.name, text, url }).catch(() => {})
} else {
const waUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`
window.open(waUrl, '_blank')
}
}
function ShareIcon({ size = 14, color = '#2C2C2A' }) {
return (
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="18" cy="5" r="3" />
<circle cx="6" cy="12" r="3" />
<circle cx="18" cy="19" r="3" />
<line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
<line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
</svg>
)
}
function StarRating({ rating = 0 }) {
const stars = [1, 2, 3, 4, 5]
return (
<div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
{stars.map((s) => (
<span key={s} style={{ fontSize: 11, color: s <= Math.round(rating) ? '#FF6B00' : '#E0DFDA' }}>★</span>
))}
<span style={{ fontSize: 10, color: COLORS.textFaint, marginLeft: 2 }}>{Number(rating).toFixed(1)}</span>
</div>
)
}
function TopBar({ communes, commune, setCommune }) {
return (
<div style={{ background: COLORS.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
<span style={{ fontSize: 16, fontWeight: 600, color: COLORS.emerald }}>China Shop</span>
{communes.length > 0 && (
<select
value={commune?.id || ''}
onChange={(e) => setCommune(communes.find((c) => c.id === e.target.value))}
style={{ background: '#F1F3F1', border: 'none', borderRadius: 20, padding: '6px 10px', fontSize: 12, color: '#2C2C2A' }}
>
{communes.map((c) => (
<option key={c.id} value={c.id}>📍 {c.name}</option>
))}
</select>
)}
</div>
)
}
function CatalogScreen({ communes, commune, setCommune, products, cart, itemsCount, total, addToCart, goCart, search, setSearch, selectedProduct, setSelectedProduct }) {
return (
<div>
<TopBar communes={communes} commune={commune} setCommune={setCommune} />
<div style={{ padding: '12px 12px 0' }}>
<div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
<span style={{ fontSize: 14, color: COLORS.textFaint }}>🔍</span>
<input
value={search}
onChange={(e) => setSearch(e.target.value)}
placeholder="Rechercher un article…"
style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent', color: '#2C2C2A' }}
/>
{search && (
<span onClick={() => setSearch('')} style={{ fontSize: 13, color: COLORS.textFaint, cursor: 'pointer' }}>✕</span>
)}
</div>
</div>
<div style={{ margin: 12, background: COLORS.emerald, borderRadius: 14, padding: '12px 14px' }}>
<p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#EAF3DE', lineHeight: 1.5 }}>
Plus vous achetez groupé, plus le prix et la livraison s'effondrent
</p>
</div>
{products.length === 0 && (
<p style={{ textAlign: 'center', fontSize: 13, color: COLORS.textMuted, padding: '20px 0' }}>Aucun article ne correspond à "{search}"</p>
)}
<div style={{ padding: '0 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingBottom: itemsCount > 0 ? 90 : 12 }}>
{products.map((p) => (
<div
key={p.id}
onClick={() => { setSelectedProduct(p); window.history.replaceState(null, '', `?p=${p.id}`) }}
style={{ background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`, padding: 10, cursor: 'pointer' }}
>
<div style={{ position: 'relative', background: '#F1F3F1', borderRadius: 10, height: 72, marginBottom: 8, overflow: 'hidden' }}>
{p.image_url && (
<img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
)}
<button
onClick={(e) => { e.stopPropagation(); shareProduct(p) }}
aria-label={`Partager ${p.name}`}
style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.95)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
>
<ShareIcon size={13} />
</button>
</div>
<p style={{ margin: '0 0 2px', fontSize: 13, color: '#2C2C2A' }}>{p.name}</p>
{p.description && (
<p style={{ margin: '0 0 2px', fontSize: 10.5, color: COLORS.textMuted, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
{p.description}
</p>
)}
<StarRating rating={p.rating} /></p>
)}
<StarRating rating={p.rating} />
{p.usage_link && (
<a
href={p.usage_link}
target="_blank"
rel="noopener noreferrer"
onClick={(e) => e.stopPropagation()}
style={{ display: 'inline-block', marginTop: 2, fontSize: 10.5, color: COLORS.emerald, textDecoration: 'underline' }}
>
Comment l'utiliser ↗
</a>
)}
<div style={{ marginTop: 4 }}>
<div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
<span style={{ fontSize: 9.5, color: COLORS.textFaint }}>Détail</span>
<span style={{ fontSize: 11, color: COLORS.textFaint, textDecoration: 'line-through' }}>{p.retail_price.toLocaleString('fr-FR')} FCFA</span>
</div>
<div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
<span style={{ fontSize: 9.5, color: COLORS.emerald, fontWeight: 600 }}>Gros</span>
<span style={{ fontSize: 15, fontWeight: 600, color: COLORS.emerald }}>{p.wholesale_price.toLocaleString('fr-FR')} FCFA</span>
</div>
</div>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
<button
onClick={(e) => { e.stopPropagation(); addToCart(p.id) }}
aria-label={`Ajouter ${p.name}`}
style={{ width: 28, height: 28, borderRadius: '50%', background: COLORS.orange, border: 'none', color: '#fff', fontSize: 16 }}
>
+
</button>
</div>
{cart[p.id] > 0 && (
<span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, background: '#EAF3DE', color: '#173404', padding: '2px 8px', borderRadius: 8 }}>
{cart[p.id]} dans le panier
</span>
)}
</div>
))}
</div>
{itemsCount > 0 && (
<div style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: 'calc(100% - 24px)', maxWidth: 396 }}>
<div onClick={goCart} style={{ background: COLORS.emeraldDark, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
<div>
<p style={{ margin: 0, fontSize: 11, color: '#C0DD97' }}>{itemsCount} article{itemsCount > 1 ? 's' : ''}</p>
<p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#fff' }}>{total.toLocaleString('fr-FR')} FCFA</p>
</div>
<div style={{ background: COLORS.orange, color: '#fff', fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 20 }}>
Voir mon panier
</div>
</div>
</div>
)}
{selectedProduct && (
<ProductDetailModal
product={selectedProduct}
cartQty={cart[selectedProduct.id] || 0}
onClose={() => { setSelectedProduct(null); window.history.replaceState(null, '', window.location.pathname) }}
onAdd={(qty) => addToCart(selectedProduct.id, qty)}
/>
)}
</div>
)
}
function ProductDetailModal({ product, cartQty, onClose, onAdd }) {
const [qty, setQty] = useState(1)
return (
<div
onClick={onClose}
style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', zIndex: 50 }}
>
<div
onClick={(e) => e.stopPropagation()}
style={{ background: COLORS.bg, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 420, margin: '0 auto', maxHeight: '85vh', overflowY: 'auto', paddingBottom: 20 }}
>
<div style={{ position: 'relative', background: '#F1F3F1', height: 180, borderRadius: '20px 20px 0 0' }}>
{product.image_url && (
<img src={product.image_url} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '20px 20px 0 0' }} />
)}
<button
onClick={onClose}
aria-label="Fermer"
style={{ position: 'absolute', top: 12, left: 12, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', fontSize: 14 }}
>
✕
</button>
<button
onClick={() => shareProduct(product)}
aria-label={`Partager ${product.name}`}
style={{ position: 'absolute', top: 12, right: 12, height: 30, borderRadius: 20, padding: '0 12px', background: 'rgba(255,255,255,0.95)', border: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: COLORS.emerald }}
>
<ShareIcon size={13} color={COLORS.emerald} />
Partager
</button>
</div>
<div style={{ padding: '16px 16px 0' }}>
<p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 600, color: '#2C2C2A' }}>{product.name}</p>
<StarRating rating={product.rating} />
{product.description && (
<p style={{ margin: '10px 0 0', fontSize: 13, color: COLORS.textMuted, lineHeight: 1.5 }}>{product.description}</p>
)}
{product.usage_link && (
<a
href={product.usage_link}
target="_blank"
rel="noopener noreferrer"
style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: COLORS.emerald, textDecoration: 'underline' }}
>
Comment l'utiliser ↗
</a>
)}
<div style={{ marginTop: 16, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 14 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
<span style={{ fontSize: 12, color: COLORS.textMuted }}>Prix de détail</span>
<span style={{ fontSize: 14, color: COLORS.textFaint, textDecoration: 'line-through' }}>{product.retail_price.toLocaleString('fr-FR')} FCFA</span>
</div>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
<span style={{ fontSize: 12, color: COLORS.emerald, fontWeight: 600 }}>Prix de gros (dès 2 articles)</span>
<span style={{ fontSize: 18, fontWeight: 600, color: COLORS.emerald }}>{product.wholesale_price.toLocaleString('fr-FR')} FCFA</span>
</div>
</div>
<div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
<span style={{ fontSize: 13, color: COLORS.textMuted }}>Quantité</span>
<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
<span
onClick={() => setQty((q) => Math.max(1, q - 1))}
style={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer' }}
>
−
</span>
<span style={{ fontSize: 16, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{qty}</span>
<span
onClick={() => setQty((q) => q + 1)}
style={{ width: 32, height: 32, borderRadius: '50%', background: COLORS.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer' }}
>
+
</span>
</div>
</div>
<button
onClick={() => onAdd(qty)}
style={{ width: '100%', marginTop: 14, background: COLORS.orange, color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: 600, padding: 13, borderRadius: 14, border: 'none' }}
>
Ajouter {qty} au panier{cartQty > 0 ? ` (${cartQty} déjà ajouté${cartQty > 1 ? 's' : ''})` : ''}
</button>
</div>
</div>
</div>
)
}
function CartScreen({ cartLines, itemsCount, tier, subtotal, total, addToCart, decFromCart, onBack, onValidate, busy, deliveryType, setDeliveryType, locating, deliveryPhone, setDeliveryPhone, deliveryAddress, setDeliveryAddress, villes, ville, setVille }) {
const gaugePct = Math.min(100, (itemsCount / 5) * 100)
const vip = itemsCount >= 5
return (
<div>
<div style={{ background: COLORS.card, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
<span onClick={onBack} style={{ cursor: 'pointer' }}>←</span>
<span style={{ fontSize: 15, fontWeight: 600 }}>Mon panier</span>
</div>
<div style={{ margin: '14px 12px 12px', background: vip ? COLORS.emerald : COLORS.emeraldDark, borderRadius: 14, padding: 14 }}>
<div style={{ height: 8, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
<div style={{ height: '100%', width: `${gaugePct}%`, background: '#639922', borderRadius: 4 }} />
</div>
<p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff' }}>
{vip ? 'Statut VIP débloqué 👑' : itemsCount >= 2 ? 'Prix de gros débloqué' : 'Encore 1 article pour débloquer le tarif de gros'}
</p>
<p style={{ margin: '4px 0 0', fontSize: 12, color: '#C0DD97', lineHeight: 1.5 }}>{tier.label}</p>
</div>
<div style={{ padding: '0 12px', marginBottom: 4 }}>
<p style={{ margin: '0 0 8px', fontSize: 12, color: COLORS.textMuted }}>Mode de livraison</p>
<div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
<div
onClick={() => setDeliveryType('standard')}
style={{
flex: 1, background: COLORS.card, borderRadius: 14, padding: 10, cursor: 'pointer',
border: deliveryType === 'standard' ? `1.5px solid ${COLORS.emerald}` : `1px solid ${COLORS.border}`,
}}
>
<p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: '#2C2C2A' }}>📦 Standard</p>
<p style={{ margin: 0, fontSize: 9.5, color: COLORS.textMuted, lineHeight: 1.3 }}>Abidjan — avant 18h</p>
</div>
<div
onClick={() => setDeliveryType('express')}
style={{
flex: 1, background: COLORS.card, borderRadius: 14, padding: 10, cursor: 'pointer',
border: deliveryType === 'express' ? `1.5px solid ${COLORS.orange}` : `1px solid ${COLORS.border}`,
}}
>
<p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: '#2C2C2A' }}>⚡ Express</p>
<p style={{ margin: 0, fontSize: 9.5, color: COLORS.textMuted, lineHeight: 1.3 }}>Abidjan — au km</p>
</div>
<div
onClick={() => setDeliveryType('expedition')}
style={{
flex: 1, background: COLORS.card, borderRadius: 14, padding: 10, cursor: 'pointer',
border: deliveryType === 'expedition' ? `1.5px solid #1E88E5` : `1px solid ${COLORS.border}`,
}}
>
<p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: '#2C2C2A' }}>🚚 Expédition</p>
<p style={{ margin: 0, fontSize: 9.5, color: COLORS.textMuted, lineHeight: 1.3 }}>Autre ville</p>
</div>
</div>
{deliveryType === 'expedition' && (
<div style={{ marginBottom: 12 }}>
<p style={{ margin: '0 0 4px', fontSize: 12, color: COLORS.textMuted }}>Ville de destination *</p>
<select
value={ville?.id || ''}
onChange={(e) => setVille(villes.find((v) => v.id === e.target.value) || null)}
style={{ width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, boxSizing: 'border-box', background: '#fff' }}
>
<option value="">— Choisir une ville —</option>
{villes.map((v) => (
<option key={v.id} value={v.id}>{v.name}{v.region && v.region !== '—' ? ` (${v.region})` : ''}</option>
))}
</select>
<p style={{ margin: '6px 0 0', fontSize: 10.5, color: '#1E88E5', lineHeight: 1.4 }}>
📦 À récupérer à l'agence de transport à {ville ? ville.name : 'votre ville'}. Vous serez contacté par téléphone dès l'arrivée du colis.
</p>
</div>
)}
</div>
<div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
{cartLines.length === 0 && (
<p style={{ fontSize: 13, color: COLORS.textMuted, textAlign: 'center', padding: '20px 0' }}>Votre panier est vide</p>
)}
{cartLines.map((l) => (
<div key={l.product.id} style={{ background: COLORS.card, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
<div style={{ width: 44, height: 44, background: '#F1F3F1', borderRadius: 10, flexShrink: 0, overflow: 'hidden' }}>
{l.product.image_url && (
<img src={l.product.image_url} alt={l.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
)}
</div>
<div style={{ flex: 1 }}>
<p style={{ margin: '0 0 2px', fontSize: 13 }}>{l.product.name}</p>
<p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: COLORS.emerald }}>{l.unit.toLocaleString('fr-FR')} FCFA</p>
</div>
<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
<span onClick={() => decFromCart(l.product.id)} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #D3D1C7', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>−</span>
<span>{l.qty}</span>
<span onClick={() => addToCart(l.product.id)} style={{ width: 22, height: 22, borderRadius: '50%', background: COLORS.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>+</span>
</div>
</div>
))}
</div>
{cartLines.length > 0 && (
<>
<div style={{ padding: '0 12px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
<div>
<p style={{ margin: '0 0 4px', fontSize: 12, color: COLORS.textMuted }}>Numéro de téléphone *</p>
<input
value={deliveryPhone}
onChange={(e) => setDeliveryPhone(e.target.value)}
placeholder="07 XX XX XX XX"
style={{ width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
/>
</div>
{deliveryType !== 'expedition' && (
<div>
<p style={{ margin: '0 0 4px', fontSize: 12, color: COLORS.textMuted }}>Adresse / repère de livraison *</p>
<input
value={deliveryAddress}
onChange={(e) => setDeliveryAddress(e.target.value)}
placeholder="Ex: Rue des jardins, près de la pharmacie…"
style={{ width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 10, border: `1px solid ${COLORS.border}`, boxSizing: 'border-box' }}
/>
</div>
)}
</div>
<div style={{ margin: '0 12px 14px', background: COLORS.card, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: 14 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.textMuted, marginBottom: 6 }}>
<span>Sous-total</span><span>{subtotal.toLocaleString('fr-FR')} FCFA</span>
</div>
{deliveryType === 'standard' && (
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.textMuted, marginBottom: 10 }}>
<span>Livraison</span><span style={{ color: COLORS.emerald }}>{tier.deliveryFee.toLocaleString('fr-FR')} FCFA</span>
</div>
)}
{deliveryType === 'express' && (
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.textMuted, marginBottom: 10 }}>
<span>Livraison express</span><span style={{ color: COLORS.orange }}>base 320 + 52,5/km</span>
</div>
)}
{deliveryType === 'expedition' && (
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: COLORS.textMuted, marginBottom: 10 }}>
<span>Expédition</span><span style={{ color: '#1E88E5' }}>{tier.deliveryFee.toLocaleString('fr-FR')} FCFA</span>
</div>
)}
<div style={{ height: 1, background: COLORS.border, marginBottom: 10 }} />
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 600 }}>
<span>Total</span>
<span>{deliveryType === 'express' ? `${subtotal.toLocaleString('fr-FR')} FCFA + livraison` : `${total.toLocaleString('fr-FR')} FCFA`}</span>
</div>
{deliveryType === 'express' && (
<p style={{ margin: '6px 0 0', fontSize: 10, color: COLORS.textFaint }}>Le tarif exact de livraison est calculé après localisation, à l'étape suivante</p>
)}
</div>
<div style={{ padding: '0 12px' }}>
<button
onClick={onValidate}
disabled={busy || locating || !deliveryPhone.trim() || (deliveryType !== 'expedition' && !deliveryAddress.trim()) || (deliveryType === 'expedition' && !ville)}
style={{ width: '100%', background: COLORS.orange, color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: 600, padding: 13, borderRadius: 14, border: 'none', opacity: (busy || locating || !deliveryPhone.trim() || (deliveryType !== 'expedition' && !deliveryAddress.trim()) || (deliveryType === 'expedition' && !ville)) ? 0.6 : 1 }}
>
{locating ? '📍 Localisation…' : busy ? 'Validation…' : '💵 Confirmer — paiement à la livraison'}
</button>
</div>
</>
)}
</div>
)
}
function TrackingScreen({ total, deliveryType, expressDistanceKm, villeName, onNewOrder }) {
const isExpress = deliveryType === 'express'
const isExpedition = deliveryType === 'expedition'
const accentColor = isExpedition ? '#1E88E5' : isExpress ? COLORS.orange : COLORS.emerald
return (
<div>
<div style={{ background: COLORS.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
<span style={{ fontSize: 15, fontWeight: 600 }}>Suivi de commande</span>
</div>
<div style={{ padding: '16px 12px 0', textAlign: 'center' }}>
<div style={{ width: 48, height: 48, background: '#EAF3DE', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 22, color: COLORS.emerald }}>
✔
</div>
<p style={{ margin: 0, fontSize: 13, color: COLORS.textMuted }}>Commande confirmée</p>
<p style={{ margin: '4px 0 0', fontSize: 12, color: accentColor, fontWeight: 600 }}>
{isExpedition
? `🚚 Expédition vers ${villeName || 'votre ville'}`
: isExpress
? `⚡ Livraison express${expressDistanceKm ? ` — ${expressDistanceKm} km` : ''}`
: '📦 Livraison standard — aujourd\'hui avant 18h'}
</p>
</div>
{total > 0 && (
<div style={{ margin: '14px 12px 0', background: '#FFF3E0', border: '1px solid #FFD9A8', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
<span style={{ fontSize: 12, color: '#8A4B00' }}>💵 À régler {isExpedition ? "à l'agence" : 'à la livraison'}</span>
<span style={{ fontSize: 15, fontWeight: 600, color: '#8A4B00' }}>{total.toLocaleString('fr-FR')} FCFA</span>
</div>
)}
<div style={{ padding: '18px 20px 4px' }}>
<TimelineStep label="Commande validée" state="done" />
<TimelineStep
label={isExpedition ? 'Préparation pour expédition' : isExpress ? 'Coursier en préparation' : 'Préparation de la commande'}
sub={isExpedition ? `Envoi vers l'agence de ${villeName || 'votre ville'}` : isExpress ? 'Prise en charge par un coursier disponible' : 'Livraison prévue aujourd\'hui avant 18h'}
state="current"
/>
<TimelineStep label={isExpedition ? 'En transit vers votre ville' : 'En route avec le livreur'} state="pending" />
<TimelineStep label={isExpedition ? 'Arrivé à l\'agence — à récupérer' : 'Livré'} state="pending" last />
</div>
<div style={{ padding: '16px 12px' }}>
<button
onClick={onNewOrder}
style={{ width: '100%', background: 'transparent', color: COLORS.emerald, textAlign: 'center', fontSize: 13, fontWeight: 600, padding: 12, borderRadius: 14, border: `1px solid ${COLORS.emerald}` }}
>
Passer une nouvelle commande
</button>
</div>
</div>
)
}
function TimelineStep({ label, sub, state, last }) {
const color = state === 'done' ? COLORS.emerald : state === 'current' ? COLORS.orange : '#D3D1C7'
return (
<div style={{ display: 'flex', gap: 10, marginBottom: last ? 0 : 18 }}>
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
<div style={{ width: 20, height: 20, borderRadius: '50%', background: state === 'pending' ? '#fff' : color, border: state === 'pending' ? '1.5px solid #D3D1C7' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>
{state === 'done' ? '✔' : ''}
</div>
{!last && <div style={{ width: 1.5, flex: 1, background: state === 'done' ? COLORS.emerald : '#D3D1C7', marginTop: 2 }} />}
</div>
<div style={{ paddingBottom: 2 }}>
<p style={{ margin: 0, fontSize: 13, fontWeight: state === 'pending' ? 400 : 600, color: state === 'pending' ? COLORS.textFaint : '#2C2C2A' }}>{label}</p>
{sub && <p style={{ margin: 0, fontSize: 11, color: COLORS.textFaint }}>{sub}</p>}
</div>
</div>
)
  }
