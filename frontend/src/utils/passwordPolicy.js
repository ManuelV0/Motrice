export const PASSWORD_REQUIREMENTS = [
  {
    id: 'length',
    label: 'Almeno 8 caratteri',
    test: (value) => String(value || '').length >= 8
  },
  {
    id: 'uppercase',
    label: 'Una lettera maiuscola',
    test: (value) => /[A-Z]/.test(String(value || ''))
  },
  {
    id: 'lowercase',
    label: 'Una lettera minuscola',
    test: (value) => /[a-z]/.test(String(value || ''))
  },
  {
    id: 'number',
    label: 'Un numero',
    test: (value) => /\d/.test(String(value || ''))
  },
  {
    id: 'special',
    label: 'Un carattere speciale',
    test: (value) => /[^A-Za-z0-9\s]/.test(String(value || ''))
  }
];

export function getPasswordRequirementStatus(password) {
  return PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(password)
  }));
}

export function isStrongPassword(password) {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
}

export function getPasswordPolicyError(password) {
  const missing = getPasswordRequirementStatus(password)
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.label.toLowerCase());

  if (!missing.length) return '';
  return `La password richiede: ${missing.join(', ')}.`;
}
