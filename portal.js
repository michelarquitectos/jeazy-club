const navButton = document.querySelector('.mobile-menu');
const navLinks = document.querySelector('.portal-links');

if (navButton && navLinks) {
  navButton.addEventListener('click', () => navLinks.classList.toggle('open'));
}

let signed = false;
let paid = false;
let membershipUnlocked = false;
const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const isDesignPreview = isLocalPreview && (
  new URLSearchParams(window.location.search).has('preview') || document.body.hasAttribute('data-local-preview')
);

const memberAreaPath = window.location.pathname.includes('/socios/');
const statusLabels = {
  incomplete: 'Expediente incompleto', review: 'En revisión', payment: 'Contacto pendiente',
  active: 'Membresía activa', rejected: 'Requiere atención', suspended: 'Membresía suspendida'
};

function getSitePrefix() {
  const sociosPosition = window.location.pathname.indexOf('/socios/');
  return sociosPosition >= 0 ? window.location.pathname.slice(0, sociosPosition) : '';
}

function buildWhatsAppUrl(code = '') {
  const whatsappNumber = String(window.JEAZY_PAYMENT?.whatsappNumber || '528714123563').replace(/\D/g, '');
  const reference = code ? ` Mi código de solicitud es: ${code}.` : '';
  const message = `Hola, quiero recibir orientación de Jeazy Club.${reference} Deseo continuar con mi registro o membresía.`;
  return whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` : '';
}

async function loadMemberJourney(user) {
  const [profileResult, identityResult, acceptanceResult, applicationResult, membershipResult, paymentResult] = await Promise.all([
    window.jeazySupabase.from('profiles').select('full_name,phone,city,state,profile_photo_path').eq('id', user.id).maybeSingle(),
    window.jeazySupabase.from('identity_documents').select('document_side,review_status').eq('user_id', user.id),
    window.jeazySupabase.from('legal_acceptances').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    window.jeazySupabase.from('membership_applications').select('application_code,status').eq('user_id', user.id).maybeSingle(),
    window.jeazySupabase.from('memberships').select('status').eq('user_id', user.id).maybeSingle(),
    window.jeazySupabase.from('payment_verifications').select('status').eq('user_id', user.id).maybeSingle()
  ]);
  const profile = profileResult.data;
  const identity = identityResult.data || [];
  const application = applicationResult.data;
  const membership = membershipResult.data;
  const payment = paymentResult.data;
  const hasProfile = Boolean(profile?.full_name && profile?.phone && profile?.city && profile?.state);
  const hasPhoto = Boolean(profile?.profile_photo_path);
  const hasIdentity = new Set(identity.map((item) => item.document_side)).size >= 2;
  const hasLegal = (acceptanceResult.count || 0) >= 2;
  const hasApplication = Boolean(application?.application_code);
  const isActive = membership?.status === 'active' && payment?.status === 'confirmed';
  let state = 'incomplete';
  if (membership?.status === 'suspended') state = 'suspended';
  else if (application?.status === 'rejected') state = 'rejected';
  else if (isActive) state = 'active';
  else if (hasApplication && hasIdentity && hasLegal) state = application?.status === 'approved' ? 'payment' : 'review';
  return { user, profile, hasProfile, hasPhoto, hasIdentity, hasLegal, hasApplication, isActive, state, code: application?.application_code || '' };
}

function applyMembershipState() {
document.querySelectorAll('[data-signed-only]').forEach((link) => {
  if (membershipUnlocked) {
    link.classList.remove('disabled');
    link.removeAttribute('aria-disabled');
    link.href = link.dataset.href;
  } else {
    link.classList.add('disabled');
    link.setAttribute('aria-disabled', 'true');
    link.removeAttribute('href');
  }
});

if (membershipUnlocked) {
  document.querySelectorAll('.card.locked').forEach((card) => card.classList.remove('locked'));
}

document.querySelectorAll('[data-sign-state]').forEach((element) => {
  element.textContent = signed ? 'Completado' : 'Pendiente';
});

document.querySelectorAll('[data-menu-state]').forEach((element) => {
  element.textContent = membershipUnlocked ? 'Disponible' : signed ? 'Pago pendiente' : 'Bloqueado';
});
}

async function initializeMembershipState() {
  if (window.jeazySupabase) {
    const { data: sessionData } = await window.jeazySupabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user && memberAreaPath && !isDesignPreview) {
      window.location.replace(`${getSitePrefix()}/acceso/`);
      return;
    }
    if (user) {
      const [acceptances, membership, payment, administrator] = await Promise.all([
        window.jeazySupabase.from('legal_acceptances').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        window.jeazySupabase.from('memberships').select('status').eq('user_id', user.id).maybeSingle(),
        window.jeazySupabase.from('payment_verifications').select('status').eq('user_id', user.id).eq('status', 'confirmed').maybeSingle(),
        window.jeazySupabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
      ]);
      signed = (acceptances.count || 0) >= 2;
      paid = membership.data?.status === 'active' && payment.data?.status === 'confirmed';
      if (administrator.data) {
        const navigation = document.querySelector('.portal-links') || document.querySelector('.portal-nav');
        if (navigation && !navigation.querySelector('[data-admin-link]')) {
          const adminLink = document.createElement('a');
          const sitePrefix = getSitePrefix();
          adminLink.href = `${sitePrefix}/admin/`;
          adminLink.textContent = 'Administración';
          adminLink.className = 'admin-nav-link';
          adminLink.dataset.adminLink = '';
          navigation.appendChild(adminLink);
        }
      }
    }
  } else if (isLocalPreview) {
    signed = localStorage.getItem('jeazy-document-signed') === 'yes';
    paid = localStorage.getItem('jeazy-payment-completed') === 'yes';
  }
  membershipUnlocked = signed && paid;
  applyMembershipState();
  if (document.body.hasAttribute('data-requires-payment') && !membershipUnlocked) window.location.replace('../pago/');
}

initializeMembershipState();

const memberDashboard = document.querySelector('#memberDashboard');
if (memberDashboard && isDesignPreview) {
  document.querySelectorAll('[data-member-name]').forEach((element) => { element.textContent = 'Socio de ejemplo'; });
  document.querySelectorAll('[data-journey-status]').forEach((element) => { element.textContent = statusLabels.incomplete; });
  document.querySelectorAll('[data-application-code]').forEach((element) => { element.textContent = 'Se genera al completar el expediente'; });
  document.querySelector('[data-step="account"]')?.classList.add('done');
  document.querySelectorAll('[data-step-label]').forEach((element) => { element.textContent = 'Pendiente'; });
  const accountLabel = document.querySelector('[data-step="account"] [data-step-label]');
  if (accountLabel) accountLabel.textContent = 'Completado';
  const whatsappUrl = buildWhatsAppUrl();
  const whatsappLink = document.querySelector('#dashboardWhatsApp');
  if (whatsappLink) whatsappLink.href = whatsappUrl;
  const qrContainer = document.querySelector('#dashboardWhatsAppQr');
  if (qrContainer && window.QRCode) new window.QRCode(qrContainer, { text: whatsappUrl, width: 132, height: 132, colorDark: '#102018', colorLight: '#ffffff' });
  memberDashboard.removeAttribute('aria-busy');
} else if (memberDashboard && window.jeazySupabase) {
  const renderMemberDashboard = async () => {
    const { data: sessionData } = await window.jeazySupabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;
    const journey = await loadMemberJourney(user);
    const displayName = journey.profile?.full_name || user.user_metadata?.full_name || 'Socio';
    document.querySelectorAll('[data-member-name]').forEach((element) => { element.textContent = displayName; });
    document.querySelectorAll('[data-journey-status]').forEach((element) => { element.textContent = statusLabels[journey.state]; });
    document.querySelectorAll('[data-application-code]').forEach((element) => { element.textContent = journey.code || 'Se genera al completar el expediente'; });
    const stepStates = { account: true, documents: journey.hasLegal, identity: journey.hasIdentity && journey.hasPhoto, contact: journey.hasApplication, active: journey.isActive };
    Object.entries(stepStates).forEach(([key, complete]) => {
      document.querySelectorAll(`[data-step="${key}"]`).forEach((element) => {
        element.classList.toggle('done', complete);
        const label = element.querySelector('[data-step-label]');
        if (label) label.textContent = complete ? 'Completado' : 'Pendiente';
      });
    });
    const primaryAction = document.querySelector('#journeyPrimaryAction');
    const primaryText = document.querySelector('#journeyPrimaryText');
    if (journey.state === 'rejected') {
      primaryAction.href = '../registro/'; primaryAction.textContent = 'Corregir mi expediente';
      primaryText.textContent = 'El equipo solicitó corregir tu documentación. Vuelve a cargar los archivos y envía nuevamente tu solicitud.';
    } else if (journey.state === 'suspended') {
      primaryAction.href = 'ayuda/'; primaryAction.textContent = 'Contactar al equipo';
      primaryText.textContent = 'Tu membresía requiere atención del equipo. Comunícate antes de intentar otro cambio.';
    } else if (journey.isActive) {
      primaryAction.href = 'menu/'; primaryAction.textContent = 'Entrar al menú de socios';
      primaryText.textContent = 'Tu membresía está activa. Ya puedes consultar el contenido reservado para socios.';
    } else if (!journey.hasProfile || !journey.hasApplication || !journey.hasIdentity || !journey.hasLegal || !journey.hasPhoto) {
      primaryAction.href = '../registro/'; primaryAction.textContent = 'Continuar mi expediente';
      primaryText.textContent = 'Completa los documentos, tu fotografía de perfil y ambos lados de tu identificación.';
    } else {
      primaryAction.href = 'pago/'; primaryAction.textContent = 'Ver mi código y contacto';
      primaryText.textContent = 'Tu expediente fue recibido. Comparte tu código por WhatsApp para continuar con el equipo.';
    }
    const whatsappUrl = buildWhatsAppUrl(journey.code);
    const whatsappLink = document.querySelector('#dashboardWhatsApp');
    if (whatsappLink && whatsappUrl) whatsappLink.href = whatsappUrl;
    const qrContainer = document.querySelector('#dashboardWhatsAppQr');
    if (qrContainer && whatsappUrl && window.QRCode) {
      qrContainer.innerHTML = '';
      new window.QRCode(qrContainer, { text: whatsappUrl, width: 132, height: 132, colorDark: '#102018', colorLight: '#ffffff' });
    }
    memberDashboard.removeAttribute('aria-busy');
  };
  renderMemberDashboard().catch(() => {
    const primaryText = document.querySelector('#journeyPrimaryText');
    if (primaryText) primaryText.textContent = 'No fue posible consultar tu avance. Recarga la página o contacta al equipo por WhatsApp.';
    memberDashboard.removeAttribute('aria-busy');
  });
}

document.querySelectorAll('[data-logout]').forEach((button) => {
  button.addEventListener('click', async () => {
    if (window.jeazySupabase) await window.jeazySupabase.auth.signOut();
    sessionStorage.removeItem('jeazy-session-active');
    window.location.href = `${getSitePrefix()}/acceso/`;
  });
});

const registration = document.querySelector('#registrationForm');
if (registration) {
  const reviewerName = 'juan ramon velazquez romo';
  const identityForm = document.querySelector('#identityForm');
  const emailConfirmation = document.querySelector('#emailConfirmation');
  const registrationDocuments = document.querySelector('#registrationDocuments');
  const registrationDocumentLinks = registrationDocuments.querySelectorAll('[data-registration-document]');
  const continueToIdentity = document.querySelector('#continueToIdentity');
  const documentDownloadMessage = document.querySelector('#documentDownloadMessage');
  const registrationMessage = document.querySelector('#registrationMessage');
  const identityMessage = document.querySelector('#identityMessage');
  const identityFiles = identityForm.querySelectorAll('[data-identity-file]');
  const reviewModeNotice = identityForm.querySelector('#reviewModeNotice');
  const registrationComplete = document.querySelector('#registrationComplete');
  let activeUser = null;
  const downloadedDocuments = new Set();

  const normalizeName = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();

  const setMessage = (element, text, type = '') => {
    element.textContent = text;
    element.className = `form-message ${type}`.trim();
  };

  const validateImage = (file, label) => {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!file) return `${label}: selecciona una imagen.`;
    if (!allowedTypes.has(file.type)) return `${label}: utiliza un archivo JPG, PNG o WEBP.`;
    if (file.size > 8 * 1024 * 1024) return `${label}: la imagen no debe superar 8 MB.`;
    return '';
  };

  const showCompletionStep = (user, applicationCode) => {
    const whatsappNumber = String(window.JEAZY_PAYMENT?.whatsappNumber || '').replace(/\D/g, '');
    const message = `Hola, terminé mi registro en Jeazy Club. Mi código de solicitud es: ${applicationCode}. Deseo vincular este número de WhatsApp con mi solicitud.`;
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    const codeElement = document.querySelector('#registrationApplicationCode');
    const whatsappLink = document.querySelector('#registrationWhatsApp');
    const copyButton = document.querySelector('#copyRegistrationCode');
    const qrContainer = document.querySelector('#registrationWhatsAppQr');

    activeUser = user;
    registration.hidden = true;
    emailConfirmation.hidden = true;
    registrationDocuments.hidden = true;
    identityForm.hidden = true;
    registrationComplete.hidden = false;
    codeElement.textContent = applicationCode;
    whatsappLink.href = whatsappUrl;
    copyButton.onclick = async () => {
      await navigator.clipboard.writeText(applicationCode);
      copyButton.textContent = 'Código copiado';
      setTimeout(() => { copyButton.textContent = 'Copiar código'; }, 1600);
    };

    qrContainer.innerHTML = '';
    if (window.QRCode) {
      new window.QRCode(qrContainer, { text: whatsappUrl, width: 180, height: 180, colorDark: '#102018', colorLight: '#ffffff' });
    } else {
      qrContainer.textContent = 'Utiliza el botón para abrir WhatsApp.';
    }
    registrationComplete.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const showIdentityStep = (user) => {
    activeUser = user;
    const fullName = user.user_metadata?.full_name || 'nuevo socio';
    const reviewMode = normalizeName(fullName) === reviewerName;

    registration.hidden = true;
    emailConfirmation.hidden = true;
    registrationDocuments.hidden = true;
    identityForm.hidden = false;
    document.querySelector('#identityMemberName').textContent = fullName;
    reviewModeNotice.hidden = !reviewMode;
    identityFiles.forEach((input) => {
      input.required = !reviewMode;
      input.closest('.upload').hidden = reviewMode;
    });
  };

  const documentStorageKey = (user) => `jeazy-registration-documents-v2:${user.id}`;

  const updateDocumentStep = () => {
    registrationDocumentLinks.forEach((link) => {
      const documentId = link.dataset.registrationDocument;
      const state = registrationDocuments.querySelector(`[data-download-state="${documentId}"]`);
      const downloaded = downloadedDocuments.has(documentId);
      state.textContent = downloaded ? 'Descargado' : 'Pendiente';
      state.classList.toggle('downloaded', downloaded);
    });
    const completed = downloadedDocuments.size === registrationDocumentLinks.length;
    continueToIdentity.disabled = !completed;
    documentDownloadMessage.textContent = completed
      ? 'Documentos descargados. Ya puedes continuar con tu identificación.'
      : `Has descargado ${downloadedDocuments.size} de ${registrationDocumentLinks.length} documentos.`;
    documentDownloadMessage.className = `form-message${completed ? ' success' : ''}`;
  };

  const showDocumentStep = (user) => {
    activeUser = user;
    if (localStorage.getItem(documentStorageKey(user)) === 'yes') {
      showIdentityStep(user);
      return;
    }
    registration.hidden = true;
    emailConfirmation.hidden = true;
    identityForm.hidden = true;
    registrationDocuments.hidden = false;
    updateDocumentStep();
  };

  registrationDocumentLinks.forEach((link) => {
    link.addEventListener('click', () => {
      downloadedDocuments.add(link.dataset.registrationDocument);
      updateDocumentStep();
    });
  });

  continueToIdentity.addEventListener('click', () => {
    if (!activeUser || downloadedDocuments.size !== registrationDocumentLinks.length) return;
    localStorage.setItem(documentStorageKey(activeUser), 'yes');
    showIdentityStep(activeUser);
  });

  const initializeRegistration = async () => {
    if (!window.jeazySupabase) {
      setMessage(registrationMessage, 'No fue posible conectar con el servicio de registro. Inténtalo nuevamente.', 'error');
      return;
    }

    const { data, error } = await window.jeazySupabase.auth.getSession();
    if (error) {
      setMessage(registrationMessage, error.message, 'error');
      return;
    }
    if (data.session?.user) {
      const user = data.session.user;
      const [applicationResult, acceptancesResult, profileResult, identityResult] = await Promise.all([
        window.jeazySupabase.from('membership_applications').select('application_code,status').eq('user_id', user.id).maybeSingle(),
        window.jeazySupabase.from('legal_acceptances').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        window.jeazySupabase.from('profiles').select('profile_photo_path').eq('id', user.id).maybeSingle(),
        window.jeazySupabase.from('identity_documents').select('document_side').eq('user_id', user.id)
      ]);
      const acceptedDocuments = (acceptancesResult.count || 0) >= 2;
      const hasPhoto = Boolean(profileResult.data?.profile_photo_path);
      const hasBothIdentitySides = new Set((identityResult.data || []).map((item) => item.document_side)).size >= 2;
      if (applicationResult.data?.application_code && applicationResult.data.status !== 'rejected' && acceptedDocuments && hasPhoto && hasBothIdentitySides) {
        showCompletionStep(user, applicationResult.data.application_code);
      } else if (applicationResult.data?.status === 'rejected' || (acceptedDocuments && (!hasPhoto || !hasBothIdentitySides))) {
        showIdentityStep(user);
        if (applicationResult.data?.status === 'rejected') {
          setMessage(identityMessage, 'El equipo solicitó corregir tus documentos. Carga nuevamente las imágenes y reenvía tu solicitud.', 'error');
        } else {
          setMessage(identityMessage, 'Continúa con las imágenes pendientes para completar tu expediente.');
        }
      } else {
        showDocumentStep(user);
      }
    }
  };

  registration.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.jeazySupabase) {
      setMessage(registrationMessage, 'La conexión segura no está disponible.', 'error');
      return;
    }

    const password = document.querySelector('#newPassword').value;
    const passwordConfirm = document.querySelector('#newPasswordConfirm').value;
    if (password !== passwordConfirm) {
      setMessage(registrationMessage, 'Las contraseñas no coinciden.', 'error');
      return;
    }

    const submitButton = registration.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Creando cuenta…';

    const profileData = {
      full_name: document.querySelector('#fullName').value.trim(),
      birth_date: document.querySelector('#birth').value,
      phone: document.querySelector('#phone').value.trim(),
      city: document.querySelector('#city').value.trim(),
      state: document.querySelector('#state').value.trim()
    };
    const email = document.querySelector('#mail').value.trim().toLowerCase();

    const { data, error } = await window.jeazySupabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        data: profileData
      }
    });

    submitButton.disabled = false;
    submitButton.textContent = 'Crear cuenta y continuar';

    if (error) {
      setMessage(registrationMessage, error.message, 'error');
      return;
    }

    if (data.session?.user) {
      showDocumentStep(data.session.user);
      return;
    }

    registration.hidden = true;
    emailConfirmation.hidden = false;
  });

  identityForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activeUser || !window.jeazySupabase) {
      setMessage(identityMessage, 'Tu sesión no está disponible. Inicia sesión nuevamente.', 'error');
      return;
    }

    const submitButton = identityForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Guardando de forma segura…';

    const metadata = activeUser.user_metadata || {};
    const fullName = metadata.full_name || 'Socio';
    const reviewMode = normalizeName(fullName) === reviewerName;
    const profilePhoto = document.querySelector('#profilePhoto')?.files[0];
    const filesToValidate = [{ file: profilePhoto, label: 'Fotografía de perfil' }];
    if (!reviewMode) {
      filesToValidate.push(
        { file: identityFiles[0]?.files[0], label: 'INE frente' },
        { file: identityFiles[1]?.files[0], label: 'INE reverso' }
      );
    }
    const imageError = filesToValidate.map(({ file, label }) => validateImage(file, label)).find(Boolean);
    if (imageError) {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar solicitud y generar código';
      setMessage(identityMessage, imageError, 'error');
      return;
    }
    const [existingProfileResult, existingDocumentsResult] = await Promise.all([
      window.jeazySupabase.from('profiles').select('profile_photo_path').eq('id', activeUser.id).maybeSingle(),
      window.jeazySupabase.from('identity_documents').select('document_side,storage_path').eq('user_id', activeUser.id)
    ]);
    const previousPhotoPath = existingProfileResult.data?.profile_photo_path || '';
    const previousDocumentPaths = new Map((existingDocumentsResult.data || []).map((item) => [item.document_side, item.storage_path]));

    const { error: profileError } = await window.jeazySupabase
      .from('profiles')
      .upsert({
        id: activeUser.id,
        full_name: fullName,
        email: activeUser.email,
        birth_date: metadata.birth_date || null,
        phone: metadata.phone || null,
        city: metadata.city || null,
        state: metadata.state || null,
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      submitButton.disabled = false;
      submitButton.textContent = 'Terminar registro';
      setMessage(identityMessage, `No se pudo guardar el perfil: ${profileError.message}`, 'error');
      return;
    }

    if (profilePhoto) {
      const photoExtension = profilePhoto.name.split('.').pop().toLowerCase();
      const photoPath = `${activeUser.id}/profile-${Date.now()}.${photoExtension}`;
      const { error: photoError } = await window.jeazySupabase.storage
        .from('profile-photos')
        .upload(photoPath, profilePhoto, { upsert: false, contentType: profilePhoto.type });

      if (photoError) {
        submitButton.disabled = false;
        submitButton.textContent = 'Terminar registro';
        setMessage(identityMessage, `No se pudo guardar la fotografía de perfil: ${photoError.message}`, 'error');
        return;
      }

      const { error: photoProfileError } = await window.jeazySupabase
        .from('profiles')
        .update({ profile_photo_path: photoPath, updated_at: new Date().toISOString() })
        .eq('id', activeUser.id);

      if (photoProfileError) {
        submitButton.disabled = false;
        submitButton.textContent = 'Terminar registro';
        setMessage(identityMessage, `No se pudo vincular la fotografía al perfil: ${photoProfileError.message}`, 'error');
        return;
      }
      if (previousPhotoPath && previousPhotoPath !== photoPath) {
        await window.jeazySupabase.storage.from('profile-photos').remove([previousPhotoPath]);
      }
    }

    if (!reviewMode) {
      const sides = ['front', 'back'];
      const documentRows = [];

      for (let index = 0; index < identityFiles.length; index += 1) {
        const file = identityFiles[index].files[0];
        const extension = file.name.split('.').pop().toLowerCase();
        const storagePath = `${activeUser.id}/ine-${sides[index]}-${Date.now()}.${extension}`;
        const { error: uploadError } = await window.jeazySupabase.storage
          .from('identity-documents')
          .upload(storagePath, file, { upsert: false, contentType: file.type });

        if (uploadError) {
          submitButton.disabled = false;
          submitButton.textContent = 'Terminar registro';
          setMessage(identityMessage, `No se pudo guardar la identificación: ${uploadError.message}`, 'error');
          return;
        }

        documentRows.push({
          user_id: activeUser.id,
          document_side: sides[index],
          storage_path: storagePath
        });
      }

      for (const documentRow of documentRows) {
        const { error: documentError } = await window.jeazySupabase.rpc('submit_identity_document', {
          p_document_side: documentRow.document_side,
          p_storage_path: documentRow.storage_path
        });
        if (documentError) {
          submitButton.disabled = false;
          submitButton.textContent = 'Terminar registro';
          setMessage(identityMessage, `No se pudo registrar la identificación: ${documentError.message}`, 'error');
          return;
        }
      }
      const replacedDocumentPaths = documentRows
        .map((documentRow) => previousDocumentPaths.get(documentRow.document_side))
        .filter(Boolean);
      if (replacedDocumentPaths.length) {
        await window.jeazySupabase.storage.from('identity-documents').remove(replacedDocumentPaths);
      }
    }

    const signerName = document.querySelector('#registrationSignature').value.trim();
    const { data: legalDocuments, error: legalDocumentsError } = await window.jeazySupabase
      .from('legal_documents')
      .select('id')
      .eq('is_active', true);

    if (legalDocumentsError || !legalDocuments?.length) {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar solicitud y generar código';
      setMessage(identityMessage, 'No fue posible consultar los documentos vigentes.', 'error');
      return;
    }

    const { data: existingAcceptances } = await window.jeazySupabase
      .from('legal_acceptances')
      .select('legal_document_id')
      .eq('user_id', activeUser.id);
    const acceptedIds = new Set((existingAcceptances || []).map((item) => item.legal_document_id));
    const acceptanceRows = legalDocuments
      .filter((document) => !acceptedIds.has(document.id))
      .map((document) => ({ user_id: activeUser.id, legal_document_id: document.id, signer_name: signerName }));
    const { error: acceptanceError } = acceptanceRows.length
      ? await window.jeazySupabase.from('legal_acceptances').insert(acceptanceRows)
      : { error: null };

    if (acceptanceError) {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar solicitud y generar código';
      setMessage(identityMessage, `No se pudo registrar la aceptación: ${acceptanceError.message}`, 'error');
      return;
    }

    const { data: applicationData, error: applicationError } = await window.jeazySupabase
      .rpc('submit_membership_application');

    if (applicationError) {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar solicitud y generar código';
      setMessage(identityMessage, `No se pudo completar la solicitud: ${applicationError.message}`, 'error');
      return;
    }

    localStorage.setItem('jeazy-registered', 'yes');
    localStorage.setItem('jeazy-identity-submitted', 'yes');
    localStorage.setItem('jeazy-document-signed', 'yes');
    sessionStorage.setItem('jeazy-session-active', 'yes');
    const applicationCode = Array.isArray(applicationData) ? applicationData[0]?.application_code : applicationData?.application_code;
    if (!applicationCode) {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar solicitud y generar código';
      setMessage(identityMessage, 'La solicitud fue guardada, pero no fue posible recuperar el código. Recarga la página.', 'error');
      return;
    }
    showCompletionStep(activeUser, applicationCode);
  });

  initializeRegistration();
}

const signing = document.querySelector('#signingForm');
if (signing) {
  signing.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#signStatus');
    const submitButton = signing.querySelector('button[type="submit"]');

    if (window.jeazySupabase) {
      submitButton.disabled = true;
      submitButton.textContent = 'Registrando firma…';

      const { data: sessionData } = await window.jeazySupabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        submitButton.disabled = false;
        submitButton.textContent = 'Firmar y desbloquear menú';
        status.textContent = 'Tu sesión terminó. Inicia sesión nuevamente para firmar.';
        status.className = 'form-message error';
        return;
      }

      const { data: documents, error: documentsError } = await window.jeazySupabase
        .from('legal_documents')
        .select('id')
        .eq('is_active', true);

      if (documentsError || !documents?.length) {
        submitButton.disabled = false;
        submitButton.textContent = 'Firmar y desbloquear menú';
        status.textContent = 'No fue posible consultar los documentos vigentes.';
        status.className = 'form-message error';
        return;
      }

      const signerName = document.querySelector('#signature').value.trim();
      const { data: existingAcceptances } = await window.jeazySupabase
        .from('legal_acceptances')
        .select('legal_document_id')
        .eq('user_id', user.id);
      const acceptedIds = new Set((existingAcceptances || []).map((item) => item.legal_document_id));
      const acceptances = documents
        .filter((document) => !acceptedIds.has(document.id))
        .map((document) => ({
        user_id: user.id,
        legal_document_id: document.id,
        signer_name: signerName
      }));
      const { error: acceptanceError } = acceptances.length
        ? await window.jeazySupabase.from('legal_acceptances').insert(acceptances)
        : { error: null };

      if (acceptanceError) {
        submitButton.disabled = false;
        submitButton.textContent = 'Firmar y desbloquear menú';
        status.textContent = `No fue posible registrar la firma: ${acceptanceError.message}`;
        status.className = 'form-message error';
        return;
      }
    }

    localStorage.setItem('jeazy-document-signed', 'yes');
    status.textContent = 'Firma registrada correctamente. Continúa con el pago de la membresía.';
    status.className = 'form-message success';
    setTimeout(() => {
      window.location.href = '../pago/';
    }, 650);
  });
}

async function hashPassword(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const login = document.querySelector('#loginForm');
if (login) {
  if (window.jeazySupabase) {
    window.jeazySupabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) window.location.replace('../socios/');
    });
  }
  login.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#loginMessage');
    const email = document.querySelector('#email').value.trim().toLowerCase();
    const password = document.querySelector('#password').value;

    if (window.jeazySupabase) {
      const submitButton = login.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Ingresando…';
      const { error } = await window.jeazySupabase.auth.signInWithPassword({ email, password });
      submitButton.disabled = false;
      submitButton.textContent = 'Acceder';

      if (error) {
        message.textContent = error.message;
        message.className = 'form-message error';
        return;
      }

      sessionStorage.setItem('jeazy-session-active', 'yes');
      window.location.href = '../socios/';
      return;
    }

    const savedProfile = JSON.parse(localStorage.getItem('jeazy-member-profile') || 'null');
    if (!savedProfile || savedProfile.email !== email || savedProfile.passwordHash !== await hashPassword(password)) {
      message.textContent = 'El correo o la contraseña no coinciden.';
      message.className = 'form-message error';
      return;
    }
    sessionStorage.setItem('jeazy-session-active', 'yes');
    window.location.href = '../socios/';
  });
}

const savedProfile = JSON.parse(localStorage.getItem('jeazy-member-profile') || 'null');
if (savedProfile) {
  document.querySelectorAll('[data-profile-name]').forEach((input) => {
    input.value = savedProfile.name;
  });
  document.querySelectorAll('[data-profile-email]').forEach((input) => {
    input.value = savedProfile.email;
  });
}

async function loadSupabaseProfile() {
  if (!window.jeazySupabase || !document.querySelector('[data-profile-name]')) return;

  const { data: sessionData } = await window.jeazySupabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return;

  const { data: profile } = await window.jeazySupabase
    .from('profiles')
    .select('full_name,email,phone,city,state,profile_photo_path')
    .eq('id', user.id)
    .maybeSingle();

  const name = profile?.full_name || user.user_metadata?.full_name;
  const email = profile?.email || user.email;
  document.querySelectorAll('[data-profile-name]').forEach((input) => {
    if (name) input.value = name;
  });
  document.querySelectorAll('[data-profile-email]').forEach((input) => {
    if (email) input.value = email;
  });
  document.querySelectorAll('[data-profile-phone]').forEach((input) => { input.value = profile?.phone || 'Pendiente'; });
  document.querySelectorAll('[data-profile-city]').forEach((input) => { input.value = profile?.city || 'Pendiente'; });
  document.querySelectorAll('[data-profile-state]').forEach((input) => { input.value = profile?.state || 'Pendiente'; });

  const { data: membership } = await window.jeazySupabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  document.querySelectorAll('[data-membership-status]').forEach((element) => {
    const labels = { active: 'Activa', pending: 'Pendiente', suspended: 'Suspendida', cancelled: 'Cancelada' };
    element.textContent = labels[membership?.status] || 'Pendiente';
  });
}

loadSupabaseProfile();

const applicationCodeElement = document.querySelector('#applicationCode');
if (applicationCodeElement) {
  const paymentConfig = window.JEAZY_PAYMENT || {};
  const statusMessage = document.querySelector('#paymentStatusMessage');
  const whatsappButton = document.querySelector('#sendReceiptWhatsApp');
  const activeMemberMenu = document.querySelector('#activeMemberMenu');
  const copyButton = document.querySelector('#copyApplicationCode');
  const digitsOnly = String(paymentConfig.whatsappNumber || '').replace(/\D/g, '');

  const paymentBank = document.querySelector('#paymentBank');
  const paymentHolder = document.querySelector('#paymentHolder');
  const paymentClabe = document.querySelector('#paymentClabe');
  if (paymentBank) paymentBank.textContent = paymentConfig.bankName || 'Pendiente de recibir';
  if (paymentHolder) paymentHolder.textContent = paymentConfig.accountHolder || 'Pendiente de recibir';
  if (paymentClabe) paymentClabe.textContent = paymentConfig.clabe || 'Pendiente de recibir';

  const setPaymentStatus = (text, type = '') => {
    statusMessage.textContent = text;
    statusMessage.className = `form-message ${type}`.trim();
  };

  const initializeManualTransfer = async () => {
    if (!window.jeazySupabase) {
      setPaymentStatus('No fue posible conectar con el sistema. Inténtalo nuevamente.', 'error');
      return;
    }

    const { data: sessionData } = await window.jeazySupabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      setPaymentStatus('Inicia sesión para consultar tu código y el estado de tu membresía.', 'error');
      return;
    }

    const [applicationResult, paymentResult, membershipResult] = await Promise.all([
      window.jeazySupabase.from('membership_applications').select('application_code,status,payment_due_at').eq('user_id', user.id).maybeSingle(),
      window.jeazySupabase.from('payment_verifications').select('status,confirmed_at').eq('user_id', user.id).maybeSingle(),
      window.jeazySupabase.from('memberships').select('status').eq('user_id', user.id).maybeSingle()
    ]);

    if (applicationResult.error || !applicationResult.data) {
      setPaymentStatus('No encontramos una solicitud activa para esta cuenta.', 'error');
      applicationCodeElement.textContent = 'No disponible';
      return;
    }

    const code = applicationResult.data.application_code;
    applicationCodeElement.textContent = code || 'Pendiente de generar';
    copyButton.disabled = !code;
    copyButton.addEventListener('click', async () => {
      await navigator.clipboard.writeText(code);
      copyButton.textContent = 'Código copiado';
      setTimeout(() => { copyButton.textContent = 'Copiar código'; }, 1600);
    });

    if (digitsOnly) {
      const whatsappText = `Hola, terminé mi registro en Jeazy Club. Mi código de solicitud es: ${code}. Deseo vincular este número de WhatsApp con mi solicitud.`;
      whatsappButton.href = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(whatsappText)}`;
      whatsappButton.target = '_blank';
      whatsappButton.rel = 'noopener';
      whatsappButton.classList.remove('disabled');
      whatsappButton.setAttribute('aria-disabled', 'false');
      setPaymentStatus('Tu código está listo. Abre WhatsApp para compartirlo directamente con el equipo.');
    } else {
      setPaymentStatus('El contacto directo no está disponible por el momento. Tu solicitud permanece guardada.');
    }
    if (paymentResult.data?.status === 'confirmed' && membershipResult.data?.status === 'active' && activeMemberMenu) {
      activeMemberMenu.hidden = false;
      setPaymentStatus('Tu código permanece disponible y tu membresía está activa.', 'success');
    }
  };

  initializeManualTransfer();
}
