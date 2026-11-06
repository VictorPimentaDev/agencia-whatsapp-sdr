import { X } from 'lucide-react';

interface Props {
  busy: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}

export function LoginDialog({ busy, onClose, onSubmit }: Props) {
  return (
    <dialog
      className="login-modal"
      aria-labelledby="login-title"
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      onClose={onClose}
    >
      <button className="modal-close" aria-label="Fechar login" onClick={onClose}>
        <X />
      </button>
      <h2 id="login-title">Conectar seu CRM</h2>
      <p>Entre com o usuário do seu Supabase.</p>
      <form action={onSubmit}>
        <label>
          E-mail
          <input name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label>
          Senha
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="primary-button" disabled={busy}>
          Entrar no workspace
        </button>
      </form>
    </dialog>
  );
}
