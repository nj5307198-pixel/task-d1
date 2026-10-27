import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { upgradePlan } from "../lib/users.js";
import { useAuth } from "../context/AuthContext.jsx";

function luhnValid(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

const formatCard = (v) =>
  v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();

const formatExpiry = (v) => {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

function validate({ cardName, cardNumber, expiry, cvc }) {
  const errors = {};
  if (cardName.trim().length < 2) errors.cardName = "Enter the name on the card.";

  const digits = cardNumber.replace(/\s/g, "");
  if (!/^\d{13,19}$/.test(digits) || !luhnValid(digits))
    errors.cardNumber = "Enter a valid card number.";

  const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
  const month = m ? Number(m[1]) : 0;
  const year = m ? 2000 + Number(m[2]) : 0;
  if (!m || month < 1 || month > 12 || new Date(year, month, 1) <= new Date())
    errors.expiry = "Enter a valid expiry date (MM/YY) that hasn't passed.";

  if (!/^\d{3,4}$/.test(cvc)) errors.cvc = "Enter the 3 or 4 digit CVC.";
  return errors;
}

const EMPTY = { cardName: "", cardNumber: "", expiry: "", cvc: "" };

const inputCls =
  "w-full border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default function PaymentModal({ onClose, onSuccess }) {
  const { user, token, updateUser, signOut } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, loading]);

  const set = (key, format = (v) => v) => (e) => {
    setValues((v) => ({ ...v, [key]: format(e.target.value) }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) return;

    setLoading(true);
    try {
      const updated = await upgradePlan(token, {
        cardName: values.cardName.trim(),
        cardNumber: values.cardNumber,
        expiry: values.expiry,
        cvc: values.cvc,
      });
      updateUser(updated); // plan is now "paid" (saved in Firestore by the backend)
      onSuccess();
    } catch (err) {
      if (err.status === 401) {
        signOut();
        onClose();
        return;
      }
      if (err.status === 409) {
        // Already paid (e.g. upgraded in another tab)
        updateUser({ ...user, plan: "paid" });
        onSuccess();
        return;
      }
      setServerError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="font-ui fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        className="w-full max-w-md border border-brand-500 bg-white p-6 shadow-lg"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="payment-title" className="text-base font-bold text-slate-900">
              Upgrade to Paid
            </h2>
            <p className="mt-1 text-sm text-slate-600">$9 per month. Cancel any time.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-900 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field id="cardName" label="Name on card" error={errors.cardName}>
            <input
              id="cardName"
              ref={firstFieldRef}
              autoComplete="cc-name"
              value={values.cardName}
              onChange={set("cardName")}
              aria-invalid={!!errors.cardName}
              aria-describedby={errors.cardName ? "cardName-error" : undefined}
              className={inputCls}
            />
          </Field>

          <Field id="cardNumber" label="Card number" error={errors.cardNumber}>
            <input
              id="cardNumber"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
              value={values.cardNumber}
              onChange={set("cardNumber", formatCard)}
              aria-invalid={!!errors.cardNumber}
              aria-describedby={errors.cardNumber ? "cardNumber-error" : undefined}
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field id="expiry" label="Expiry (MM/YY)" error={errors.expiry}>
              <input
                id="expiry"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="08/29"
                value={values.expiry}
                onChange={set("expiry", formatExpiry)}
                aria-invalid={!!errors.expiry}
                aria-describedby={errors.expiry ? "expiry-error" : undefined}
                className={inputCls}
              />
            </Field>
            <Field id="cvc" label="CVC" error={errors.cvc}>
              <input
                id="cvc"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                maxLength={4}
                value={values.cvc}
                onChange={set("cvc", (v) => v.replace(/\D/g, "").slice(0, 4))}
                aria-invalid={!!errors.cvc}
                aria-describedby={errors.cvc ? "cvc-error" : undefined}
                className={inputCls}
              />
            </Field>
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-red-600">
              {serverError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border border-slate-300 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-600 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Processing..." : "Pay $9 and upgrade"}
            </button>
          </div>

          <p className="text-xs text-slate-500">
            Demo only: your card details are checked but never stored, and you are not charged.
          </p>
        </form>
      </div>
    </div>
  );
}
