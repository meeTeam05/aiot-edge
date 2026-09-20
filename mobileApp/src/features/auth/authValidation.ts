export interface AuthValidationErrors {
  email?: string;
  password?: string;
  fullName?: string;
}

export function validateLogin(email: string, password: string): AuthValidationErrors {
  const errors: AuthValidationErrors = {};
  if (!email.includes('@')) errors.email = 'Enter a valid email';
  if (password.length < 6) errors.password = 'Min 6 characters';
  return errors;
}

export function validateRegister(fullName: string, email: string, password: string): AuthValidationErrors {
  return {
    ...(fullName.trim().length === 0 ? { fullName: 'Name required' } : {}),
    ...(!email.includes('@') ? { email: 'Valid email required' } : {}),
    ...(password.length < 6 ? { password: 'Min 6 characters' } : {}),
  };
}
