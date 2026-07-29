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
  registration.addEventListener('submit', (event) => {
    event.preventDefault();
    localStorage.setItem('jeazy-registered', 'yes');
    localStorage.setItem('jeazy-identity-submitted', 'yes');
    sessionStorage.setItem('jeazy-session-active', 'yes');
    window.location.href = '../socios/documento/';
  });
}

const signing = document.querySelector('#signingForm');
if (signing) {
  signing.addEventListener('submit', (event) => {
    event.preventDefault();
    localStorage.setItem('jeazy-document-signed', 'yes');
    document.querySelector('#signStatus').textContent = 'Firma de demostración completada. El menú ya está disponible.';
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
    const savedProfile = JSON.parse(localStorage.getItem('jeazy-member-profile') || 'null');
    const email = document.querySelector('#email').value.trim().toLowerCase();
    const password = document.querySelector('#password').value;

    if (!savedProfile) {
      message.textContent = 'Primero activa tu cuenta con el código personal.';
      message.className = 'form-message error';
      return;
    }

    const passwordHash = await hashPassword(password);
    if (savedProfile.email !== email || savedProfile.passwordHash !== passwordHash) {
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
