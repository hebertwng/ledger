// Papéis e permissões (seção 3 da especificação). Resolvido aqui para reuso tanto na UI
// (habilitar/ocultar ações) quanto, nas Etapas 7/8, pelas regras do Firestore — a verificação
// no frontend nunca é suficiente sozinha, conforme a especificação exige.
export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
});

const ROLE_PERMISSIONS = {
  [ROLES.OWNER]: ['manageMembers', 'manageSettings', 'manageCatalogs', 'manageTransactions', 'view'],
  [ROLES.ADMIN]: ['manageMembers', 'manageSettings', 'manageCatalogs', 'manageTransactions', 'view'],
  [ROLES.EDITOR]: ['manageTransactions', 'view'],
  [ROLES.VIEWER]: ['view'],
};

export function hasPermission(role, action) {
  return (ROLE_PERMISSIONS[role] || []).includes(action);
}

// Etapa 2: modo local sempre atua como proprietário do próprio espaço.
// Etapas 7/8 resolvem o papel real a partir do registro em "members".
export function resolveCurrentRole() {
  return ROLES.OWNER;
}
