const client = window.jeazySupabase;
const loginPanel = document.querySelector('#adminLoginPanel');
const dashboard = document.querySelector('#adminDashboard');
const loginForm = document.querySelector('#adminLoginForm');
const loginMessage = document.querySelector('#adminLoginMessage');
const adminMessage = document.querySelector('#adminMessage');
const logoutButton = document.querySelector('#adminLogout');
const memberList = document.querySelector('#adminMemberList');
const searchInput = document.querySelector('#adminSearch');
let adminRows = [];

const message = (element, text, type = '') => {
  element.textContent = text;
  element.className = `form-message ${type}`.trim();
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

async function isAdministrator(userId) {
  if (!client || !userId) return false;
  const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  return !error && Boolean(data);
}

function renderMembers(rows) {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = rows.filter(({ profile }) => [profile.full_name, profile.email, profile.phone]
    .some((value) => String(value || '').toLowerCase().includes(query)));

  if (!filtered.length) {
    memberList.innerHTML = '<div class="admin-empty">No hay expedientes que coincidan con la búsqueda.</div>';
    return;
  }

  memberList.innerHTML = filtered.map(({ profile, application, documents, membership, payment, signatures }) => `
    <article class="admin-member" data-user-id="${escapeHtml(profile.id)}">
      <div class="admin-member-summary">
        <div><span class="status">${escapeHtml(application?.status || 'sin solicitud')}</span><h2>${escapeHtml(profile.full_name)}</h2><p>${escapeHtml(profile.email)} · ${escapeHtml(profile.phone || 'Sin teléfono')}</p></div>
        <div class="admin-member-state"><small>Membresía</small><strong>${escapeHtml(membership?.status || 'pendiente')}</strong></div>
      </div>
      <div class="admin-details">
        <div><small>Ubicación</small><strong>${escapeHtml([profile.city, profile.state].filter(Boolean).join(', ') || 'Pendiente')}</strong></div>
        <div><small>Nacimiento</small><strong>${escapeHtml(profile.birth_date || 'Pendiente')}</strong></div>
        <div><small>INE</small><strong>${documents.length}/2 archivos</strong></div>
        <div><small>Firmas</small><strong>${signatures} documentos</strong></div>
        <div><small>Cuota</small><strong>${escapeHtml(payment?.status || 'pendiente')}</strong></div>
      </div>
      <div class="admin-documents">
        ${documents.map((document) => `<button class="document-link" type="button" data-document-path="${escapeHtml(document.storage_path)}">Ver INE ${document.document_side === 'front' ? 'frente' : 'reverso'}</button>`).join('') || '<span>Identificación no disponible</span>'}
        ${profile.profile_photo_path ? `<button class="document-link" type="button" data-photo-path="${escapeHtml(profile.profile_photo_path)}">Ver foto de perfil</button>` : ''}
      </div>
      <div class="admin-actions">
        <button class="btn" type="button" data-review="approved">Aprobar identidad</button>
        <button class="btn secondary" type="button" data-review="rejected">Rechazar</button>
        <button class="btn secondary" type="button" data-generate-payment>Generar código</button>
        <button class="btn secondary" type="button" data-payment="confirmed">Confirmar cuota</button>
        <button class="btn secondary" type="button" data-membership="suspended">Suspender</button>
      </div>
    </article>`).join('');
}

async function loadDashboard() {
  message(adminMessage, 'Actualizando expedientes…');
  const [profilesResult, applicationsResult, documentsResult, membershipsResult, paymentsResult, acceptancesResult] = await Promise.all([
    client.from('profiles').select('*').order('created_at', { ascending: false }),
    client.from('membership_applications').select('*'),
    client.from('identity_documents').select('*'),
    client.from('memberships').select('*'),
    client.from('payment_verifications').select('*').order('created_at', { ascending: false }),
    client.from('legal_acceptances').select('user_id')
  ]);
  const failed = [profilesResult, applicationsResult, documentsResult, membershipsResult, paymentsResult, acceptancesResult].find((result) => result.error);
  if (failed) {
    message(adminMessage, `No fue posible cargar los expedientes: ${failed.error.message}`, 'error');
    return;
  }

  adminRows = profilesResult.data.map((profile) => ({
    profile,
    application: applicationsResult.data.find((row) => row.user_id === profile.id),
    documents: documentsResult.data.filter((row) => row.user_id === profile.id),
    membership: membershipsResult.data.find((row) => row.user_id === profile.id),
    payment: paymentsResult.data.find((row) => row.user_id === profile.id),
    signatures: acceptancesResult.data.filter((row) => row.user_id === profile.id).length
  }));

  document.querySelector('#metricApplications').textContent = applicationsResult.data.length;
  document.querySelector('#metricPending').textContent = applicationsResult.data.filter((row) => ['submitted', 'under_review'].includes(row.status)).length;
  document.querySelector('#metricActive').textContent = membershipsResult.data.filter((row) => row.status === 'active').length;
  document.querySelector('#metricPayments').textContent = paymentsResult.data.filter((row) => row.status === 'pending').length;
  message(adminMessage, `${adminRows.length} expediente${adminRows.length === 1 ? '' : 's'} disponible${adminRows.length === 1 ? '' : 's'}.`, 'success');
  renderMembers(adminRows);
}

async function showDashboard(user) {
  if (!await isAdministrator(user.id)) {
    await client.auth.signOut();
    loginPanel.hidden = false;
    dashboard.hidden = true;
    logoutButton.hidden = true;
    message(loginMessage, 'Esta cuenta no tiene permisos administrativos.', 'error');
    return;
  }
  loginPanel.hidden = true;
  dashboard.hidden = false;
  logoutButton.hidden = false;
  await loadDashboard();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const { data, error } = await client.auth.signInWithPassword({
    email: document.querySelector('#adminEmail').value.trim().toLowerCase(),
    password: document.querySelector('#adminPassword').value
  });
  button.disabled = false;
  if (error) return message(loginMessage, 'El correo o la contraseña no son correctos.', 'error');
  await showDashboard(data.user);
});

memberList.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  const card = target.closest('[data-user-id]');
  const userId = card?.dataset.userId;

  if (target.dataset.documentPath || target.dataset.photoPath) {
    const bucket = target.dataset.documentPath ? 'identity-documents' : 'profile-photos';
    const path = target.dataset.documentPath || target.dataset.photoPath;
    const previewWindow = window.open('', '_blank');
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 120);
    if (error) {
      previewWindow?.close();
      return message(adminMessage, `No fue posible abrir el archivo: ${error.message}`, 'error');
    }
    if (!previewWindow) {
      return message(adminMessage, 'El navegador bloqueó la vista. Permite ventanas emergentes para jeazyclub.mx e inténtalo nuevamente.', 'error');
    }
    previewWindow.opener = null;
    previewWindow.location.href = data.signedUrl;
    return;
  }

  target.disabled = true;
  let result;
  if (target.dataset.review) {
    result = await client.from('identity_documents').update({ review_status: target.dataset.review }).eq('user_id', userId);
    if (!result.error) result = await client.from('membership_applications').update({ status: target.dataset.review === 'approved' ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() }).eq('user_id', userId);
  } else if (target.hasAttribute('data-generate-payment')) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(crypto.getRandomValues(new Uint8Array(9)), (value) => alphabet[value % alphabet.length]).join('');
    result = await client.from('payment_verifications').upsert({ user_id: userId, verification_code: code, status: 'pending', amount_cents: 142000, discount_percent: 15 }, { onConflict: 'user_id' });
    if (!result.error) message(adminMessage, `Código generado: ${code}. Compártelo únicamente después de confirmar la transferencia.`, 'success');
  } else if (target.dataset.payment) {
    result = await client.from('payment_verifications').upsert({ user_id: userId, status: 'confirmed', confirmed_at: new Date().toISOString(), amount_cents: 142000, discount_percent: 15 }, { onConflict: 'user_id' });
    if (!result.error) result = await client.from('memberships').upsert({ user_id: userId, status: 'active', activated_at: new Date().toISOString() });
  } else if (target.dataset.membership) {
    result = await client.from('memberships').upsert({ user_id: userId, status: target.dataset.membership });
  }
  target.disabled = false;
  if (result?.error) return message(adminMessage, `No fue posible guardar el cambio: ${result.error.message}`, 'error');
  await loadDashboard();
});

searchInput.addEventListener('input', () => renderMembers(adminRows));
document.querySelector('#refreshAdmin').addEventListener('click', loadDashboard);
logoutButton.addEventListener('click', async () => { await client.auth.signOut(); window.location.reload(); });

(async () => {
  if (!client) return message(loginMessage, 'No fue posible conectar con Supabase.', 'error');
  const { data } = await client.auth.getSession();
  if (data.session?.user) await showDashboard(data.session.user);
})();
