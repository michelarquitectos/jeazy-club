const navButton = document.querySelector('.mobile-menu');
const navLinks = document.querySelector('.portal-links');

if (navButton && navLinks) {
  navButton.addEventListener('click', () => navLinks.classList.toggle('open'));
}

const signed = localStorage.getItem('jeazy-document-signed') === 'yes';

document.querySelectorAll('[data-signed-only]').forEach((link) => {
  if (signed) {
    link.classList.remove('disabled');
    link.removeAttribute('aria-disabled');
    link.href = link.dataset.href;
  } else {
    link.classList.add('disabled');
    link.setAttribute('aria-disabled', 'true');
  }
});

if (signed) {
  document.querySelectorAll('.card.locked').forEach((card) => card.classList.remove('locked'));
}

document.querySelectorAll('[data-sign-state]').forEach((element) => {
  element.textContent = signed ? 'Completado' : 'Pendiente';
});

document.querySelectorAll('[data-menu-state]').forEach((element) => {
  element.textContent = signed ? 'Disponible' : 'Bloqueado';
});

const registration = document.querySelector('#registrationForm');
if (registration) {
  const reviewerName = 'juan ramon velazquez romo';
  const identityForm = document.querySelector('#identityForm');
  const emailConfirmation = document.querySelector('#emailConfirmation');
  const registrationMessage = document.querySelector('#registrationMessage');
  const identityMessage = document.querySelector('#identityMessage');
  const identityFiles = identityForm.querySelectorAll('[data-identity-file]');
  const reviewModeNotice = identityForm.querySelector('#reviewModeNotice');
  let activeUser = null;

  const normalizeName = (value) => value.trim().replace(/\s+/g, ' ').toLowerCase();

  const setMessage = (element, text, type = '') => {
    element.textContent = text;
    element.className = `form-message ${type}`.trim();
  };

  const showIdentityStep = (user) => {
    activeUser = user;
    const fullName = user.user_metadata?.full_name || 'nuevo socio';
    const reviewMode = normalizeName(fullName) === reviewerName;

    registration.hidden = true;
    emailConfirmation.hidden = true;
    identityForm.hidden = false;
    document.querySelector('#identityMemberName').textContent = fullName;
    reviewModeNotice.hidden = !reviewMode;
    identityFiles.forEach((input) => {
      input.required = !reviewMode;
      input.closest('.upload').hidden = reviewMode;
    });
  };

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
      showIdentityStep(data.session.user);
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
      phone: document.querySelector('#phone').value.trim()
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
      showIdentityStep(data.session.user);
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

    const { error: profileError } = await window.jeazySupabase
      .from('profiles')
      .upsert({
        id: activeUser.id,
        full_name: fullName,
        email: activeUser.email,
        birth_date: metadata.birth_date || null,
        phone: metadata.phone || null,
        updated_at: new Date().toISOString()
      });

    if (profileError) {
      submitButton.disabled = false;
      submitButton.textContent = 'Terminar registro';
      setMessage(identityMessage, `No se pudo guardar el perfil: ${profileError.message}`, 'error');
      return;
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

      const { error: documentsError } = await window.jeazySupabase
        .from('identity_documents')
        .upsert(documentRows, { onConflict: 'user_id,document_side' });

      if (documentsError) {
        submitButton.disabled = false;
        submitButton.textContent = 'Terminar registro';
        setMessage(identityMessage, `No se pudo registrar la identificación: ${documentsError.message}`, 'error');
        return;
      }
    }

    const { error: applicationError } = await window.jeazySupabase
      .from('membership_applications')
      .upsert({ user_id: activeUser.id, status: 'submitted' }, { onConflict: 'user_id' });

    if (applicationError) {
      submitButton.disabled = false;
      submitButton.textContent = 'Terminar registro';
      setMessage(identityMessage, `No se pudo completar la solicitud: ${applicationError.message}`, 'error');
      return;
    }

    localStorage.setItem('jeazy-registered', 'yes');
    localStorage.setItem('jeazy-identity-submitted', 'yes');
    sessionStorage.setItem('jeazy-session-active', 'yes');
    window.location.href = '../socios/documento/';
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
    status.textContent = 'Firma registrada correctamente. El menú ya está disponible.';
    status.className = 'form-message success';
    setTimeout(() => {
      window.location.href = '../menu/';
    }, 650);
  });
}

const demoMembers = {
  '000000001': {
    name: 'Juan Ramon Velazquez Romo'
  }
};

async function hashPassword(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const memberCodeForm = document.querySelector('#memberCodeForm');
const profileActivation = document.querySelector('#profileActivation');
let confirmedMember = null;

if (memberCodeForm && profileActivation) {
  memberCodeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const codeInput = document.querySelector('#memberCode');
    const message = document.querySelector('#memberCodeMessage');
    const code = codeInput.value.trim().toUpperCase();
    const member = demoMembers[code];

    if (!member) {
      confirmedMember = null;
      profileActivation.hidden = true;
      message.textContent = 'El código no es válido. Revisa los nueve caracteres e inténtalo nuevamente.';
      message.className = 'form-message error';
      return;
    }

    confirmedMember = { ...member, code };
    document.querySelector('#confirmedMemberName').textContent = member.name;
    message.textContent = 'Código confirmado. Ahora crea tu acceso personal.';
    message.className = 'form-message success';
    profileActivation.hidden = false;
    profileActivation.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

const profileSetupForm = document.querySelector('#profileSetupForm');
if (profileSetupForm) {
  profileSetupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.querySelector('#profileSetupMessage');
    const email = document.querySelector('#activationEmail').value.trim().toLowerCase();
    const password = document.querySelector('#activationPassword').value;
    const passwordConfirm = document.querySelector('#activationPasswordConfirm').value;

    if (!confirmedMember) {
      message.textContent = 'Primero confirma tu código personal.';
      message.className = 'form-message error';
      return;
    }

    if (password !== passwordConfirm) {
      message.textContent = 'Las contraseñas no coinciden.';
      message.className = 'form-message error';
      return;
    }

    const profile = {
      code: confirmedMember.code,
      name: confirmedMember.name,
      email,
      passwordHash: await hashPassword(password)
    };

    localStorage.setItem('jeazy-member-profile', JSON.stringify(profile));
    localStorage.setItem('jeazy-registered', 'yes');
    sessionStorage.setItem('jeazy-session-active', 'yes');
    message.textContent = 'Perfil creado correctamente. Entrando a tu área de socios…';
    message.className = 'form-message success';

    setTimeout(() => {
      window.location.href = '../socios/perfil/';
    }, 700);
  });
}

const login = document.querySelector('#loginForm');
if (login) {
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
    .select('full_name,email')
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
}

loadSupabaseProfile();
