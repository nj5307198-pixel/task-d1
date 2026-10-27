import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import PaymentModal from "../components/PaymentModal.jsx";


const FEATURES = [
  { label: "Read free posts and articles", free: true, paid: true },
  { label: "Read paid (premium) posts", free: false, paid: true },
  { label: "Posts you can publish per month", free: "5", paid: "Unlimited" },
  { label: "Image upload size limit", free: "2 MB", paid: "20 MB" },
  { label: "Tags per post", free: "3", paid: "10" },
  { label: "Daily Insider newsletter", free: true, paid: true },
  { label: "Profile badge", free: false, paid: true },
  { label: "Ad-free browsing", free: false, paid: true },
  { label: "Support response time", free: "3 days", paid: "Same day" },
];



function Cell({ value }) {
  if (value === true)
    return <Check size={16} className="mx-auto text-brand-600" aria-label="Included" />;
  if (value === false)
    return <Minus size={16} className="mx-auto text-slate-300" aria-label="Not included" />;
  return <span>{value}</span>;
}

export default function Pricing() {
  const { user, isPaid } = useAuth();
  const [open, setOpen] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState(false);

  function handleSuccess() {
    setOpen(false);
    setJustUpgraded(true);
  }

  // Free-plan button state
  let cta;
  if (!user) {
    cta = (
      <>
        <button
          type="button"
          disabled
          className="w-full bg-brand-600 py-2 text-sm text-white opacity-50"
        >
          Upgrade Plan
        </button>
        <p className="mt-2 text-xs text-slate-600">
          <Link to="/login" className="text-brand-600 underline">
            Log in
          </Link>{" "}
          to upgrade your plan.
        </p>
      </>
    );
  } else if (isPaid) {
    cta = (
      <button
        type="button"
        disabled
        className="w-full bg-slate-200 py-2 text-sm text-slate-500"
      >
        You're on the Paid plan
      </button>
    );
  } else {
    cta = (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-brand-600 py-2 text-sm text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
      >
        Upgrade Plan
      </button>
    );
  }

  return (
    <main className="font-ui mx-auto my-10 w-full max-w-4xl px-4 text-slate-900">
      <h1 className="text-2xl font-bold">Pricing</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        Read and share for free. Upgrade when you want to publish more and read premium posts.
      </p>

      {(justUpgraded || isPaid) && user && (
        <p
          role="status"
          className="mt-6 border border-brand-500 bg-brand-50 p-3 text-sm text-brand-700"
        >
          {justUpgraded
            ? "Upgrade complete. You're now on the Paid plan."
            : "You're on the Paid plan. Thanks for supporting DEV@Deakin."}
        </p>
      )}

      {/* Plan cards */}
      <section className="mt-8 grid gap-6 md:grid-cols-2" aria-label="Plans">
        <div
          className={`border p-6 ${user && !isPaid ? "border-brand-500" : "border-slate-300"
            }`}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Free</h2>
            {user && !isPaid && (
              <span className="text-xs text-brand-700">Your current plan</span>
            )}
          </div>
          <p className="mt-2 text-3xl font-bold">
            $0<span className="text-sm font-normal text-slate-500"> / month</span>
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Everything you need to read and ask questions.
          </p>
          <div className="mt-6">
            <button
              type="button"
              disabled
              className="w-full border border-slate-300 py-2 text-sm text-slate-500"
            >
              {user && !isPaid ? "Current plan" : "Included with every account"}
            </button>
          </div>
        </div>

        <div
          className={`border p-6 ${isPaid ? "border-brand-500" : "border-slate-900"
            } bg-slate-50`}
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Paid</h2>
            {isPaid && <span className="text-xs text-brand-700">Your current plan</span>}
          </div>
          <p className="mt-2 text-3xl font-bold">
            $9<span className="text-sm font-normal text-slate-500"> / month</span>
          </p>
          <p className="mt-2 text-sm text-slate-600">
            More posts, bigger uploads and access to premium content.
          </p>
          <div className="mt-6">{cta}</div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mt-12" aria-labelledby="compare-title">
        <h2 id="compare-title" className="text-lg font-bold">
          Compare plans
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th scope="col" className="py-2 pr-4 font-normal text-slate-500">
                  Feature
                </th>
                <th scope="col" className="w-28 py-2 text-center font-bold">
                  Free
                </th>
                <th scope="col" className="w-28 py-2 text-center font-bold">
                  Paid
                </th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => (
                <tr key={f.label} className="border-b border-slate-200">
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                    {f.label}
                  </th>
                  <td className="py-2.5 text-center text-slate-700">
                    <Cell value={f.free} />
                  </td>
                  <td className="py-2.5 text-center text-slate-900">
                    <Cell value={f.paid} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      {open && <PaymentModal onClose={() => setOpen(false)} onSuccess={handleSuccess} />}
    </main>
  );
}
