const fs = require('fs');

try {
  // 1. Append CSS securely
  const cssPath = 'c:/Users/saach/Downloads/pprint-2/pprint-2/css/style.css';
  let cssContent = fs.readFileSync(cssPath, 'utf8');
  if (!cssContent.includes('.shake-anim')) {
    const cssApp = `\n/* Smart Email Validation Styles */
.input-invalid .form-input { border-color: #EF4444 !important; background-color: #FEF2F2 !important; }
.input-invalid .form-input:focus { outline: none !important; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2) !important; }
.input-valid .form-input { border-color: #10B981 !important; }
.input-valid .form-input:focus { outline: none !important; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2) !important; }
.shake-anim { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}\n`;
    fs.appendFileSync(cssPath, cssApp);
  }

  // 2. Modify auth.js
  const authjsPath = 'c:/Users/saach/Downloads/pprint-2/pprint-2/js/auth.js';
  let authjs = fs.readFileSync(authjsPath, 'utf8');

  const validationFn = `// ==================== SMART EMAIL VALIDATION ====================
function validateSmartEmail(email) {
  if (!email) return { valid: false, msg: 'Please enter your email address.' };
  
  const parts = email.split('@');
  if (parts.length !== 2) return { valid: false, msg: 'Please enter a valid and meaningful email address.' };
  
  const [username, domain] = parts;
  if (!domain) return { valid: false, msg: 'Please enter a valid and meaningful email address.' };
  
  const allowedDomains = ['gmail.com', 'outlook.com', 'yahoo.com'];
  if (!allowedDomains.includes(domain.toLowerCase())) {
    return { valid: false, msg: 'Only gmail.com, outlook.com, or yahoo.com are allowed.' };
  }
  
  if (username.length < 5) return { valid: false, msg: 'Email username must be at least 5 characters long.' };
  
  const blockWords = ['abc', 'xyz', 'test', 'demo', 'user', 'temp'];
  const lowerUser = username.toLowerCase();
  for (let w of blockWords) {
    if (lowerUser.includes(w)) {
      return { valid: false, msg: 'Please enter a valid and meaningful email address.' };
    }
  }
  
  const hasLetter = /[a-zA-Z]/.test(username);
  const hasNumber = /[0-9]/.test(username);
  const hasFullNamePattern = /[\\._]/.test(username);
  
  if (!hasLetter || (!hasNumber && !hasFullNamePattern)) {
    return { valid: false, msg: 'Please enter a valid and meaningful email address.' };
  }
  
  return { valid: true, msg: '' };
}

function attachEmailValidator(form, emailInput, submitBtn) {
  if (!emailInput || !form || !submitBtn) return;
  const wrapper = emailInput.closest('.input-with-icon');
  const group = emailInput.closest('.form-group');
  if(!group) return;
  
  let errEl = group.querySelector('.email-error-msg');
  if(!errEl) {
    errEl = document.createElement('p');
    errEl.className = 'email-error-msg text-xs hidden';
    errEl.style.color = '#DC2626';
    errEl.style.fontWeight = '500';
    errEl.style.marginTop = '4px';
    group.appendChild(errEl);
  }
  
  let successIcon = wrapper.querySelector('.email-success-icon');
  if(!successIcon) {
    successIcon = document.createElement('span');
    successIcon.className = 'input-action-icon email-success-icon hidden';
    successIcon.style.color = '#10B981';
    successIcon.style.right = '10px';
    successIcon.style.top = '10px';
    successIcon.style.pointerEvents = 'none';
    successIcon.style.position = 'absolute';
    successIcon.innerHTML = '✅';
    wrapper.appendChild(successIcon);
  }
  
  emailInput.addEventListener('input', () => {
    const val = emailInput.value.trim();
    if(val === '') {
       wrapper.classList.remove('input-invalid', 'input-valid');
       errEl.classList.add('hidden');
       successIcon.classList.add('hidden');
       submitBtn.disabled = true;
       submitBtn.style.opacity = '0.5';
       return;
    }
    
    const res = validateSmartEmail(val);
    if(!res.valid) {
      wrapper.classList.add('input-invalid');
      wrapper.classList.remove('input-valid');
      errEl.textContent = res.msg;
      errEl.classList.remove('hidden');
      successIcon.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
    } else {
      wrapper.classList.remove('input-invalid');
      wrapper.classList.add('input-valid');
      errEl.classList.add('hidden');
      successIcon.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    }
  });

  emailInput.addEventListener('blur', () => {
    const val = emailInput.value.trim();
    if(val === '') return;
    const res = validateSmartEmail(val);
    if(!res.valid) {
       wrapper.classList.remove('shake-anim');
       void wrapper.offsetWidth;
       wrapper.classList.add('shake-anim');
    }
  });
}
\n`;

  if (!authjs.includes('validateSmartEmail')) {
     authjs = validationFn + authjs;
  }

  if (authjs.includes("const signupBtn = document.getElementById('signupBtn');") && !authjs.includes('attachEmailValidator(')) {
     authjs = authjs.replace(
        "const signupBtn = document.getElementById('signupBtn');",
        "const signupBtn = document.getElementById('signupBtn');\n  if(signupForm && emailInput && signupBtn) { attachEmailValidator(signupForm, emailInput, signupBtn); signupBtn.disabled = true; signupBtn.style.opacity = '0.5'; }"
     );
  }

  // Swap out the direct regex server check bypass
  const oldRegex = "if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) { showError(signupError, 'Please enter a valid email address.'); return; }";
  const newValid = "const emailValid = validateSmartEmail(email); if (!emailValid.valid) { showError(signupError, emailValid.msg); return; }";
  if (authjs.includes(oldRegex)) {
    authjs = authjs.replace(oldRegex, newValid);
  }

  // Make sure we apply this if there's any other regex check (there shouldn't be based on the previous file content)
  fs.writeFileSync(authjsPath, authjs);

  // 3. Update HTML Files
  const htmlFiles = ['signup.html', 'cr-signup.html', 'shopkeeper-signup.html'];
  for(let file of htmlFiles) {
     let path = `c:/Users/saach/Downloads/pprint-2/pprint-2/${file}`;
     let html = fs.readFileSync(path, 'utf8');
     
     if (!html.includes('Use your real email')) {
         const regex = /(<input type="email" id="email"[^>]*>\s*<\/div>)/g;
         html = html.replace(regex, '$1\n          <p class="text-secondary text-xs mt-1" style="font-size: 0.75rem; color: #6B7280;">Use your real email (name or college ID recommended)</p>');
         fs.writeFileSync(path, html);
     }
  }

  console.log("SUCCESS");
} catch(e) {
  console.error("ERROR:", e);
}
