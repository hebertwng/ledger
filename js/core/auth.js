const LOCAL_USER_ID = 'local-user';

// Etapa 2: modo local não exige login. A Etapa 8 substitui este módulo por
// Firebase Authentication quando o usuário configurar um projeto (seção 2.1).
export function getCurrentUser() {
  return { uid: LOCAL_USER_ID, mode: 'local' };
}
