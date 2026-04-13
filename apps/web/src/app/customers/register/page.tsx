"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

type Step = 1 | 2 | 3;

const DIETARY_OPTIONS = [
  { value: "gluten_free", label: "Gluten-free", icon: "🌾" },
  { value: "vegan",       label: "Vegan",        icon: "🌱" },
  { value: "nut_free",    label: "Nut-free",      icon: "🥜" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "bread",   label: "Bread",   icon: "🍞" },
  { value: "pastry",  label: "Pastry",  icon: "🥐" },
  { value: "cakes",   label: "Cakes",   icon: "🎂" },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { mutateAsync: register, isPending } = api.customers.register.useMutation();
  const utils = api.useUtils();

  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [email,     setEmail]     = useState("");
  const [birthday,  setBirthday]  = useState("");

  // Step 2
  const [dietary,   setDietary]   = useState<string[]>([]);
  const [category,  setCategory]  = useState("");

  // Step 3
  const [loyaltyOptIn,   setLoyaltyOptIn]   = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  function toggleDietary(val: string) {
    setDietary((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    );
  }

  function step1Valid() {
    return firstName.trim() && lastName.trim() && (phone.trim() || email.trim());
  }

  async function handleFinish() {
    setError(null);
    try {
      const customer = await register({
        firstName:           firstName.trim(),
        lastName:            lastName.trim(),
        phone:               phone.trim() || null,
        email:               email.trim() || null,
        birthday:            birthday || null,
        dietaryRequirements: dietary as ("gluten_free" | "vegan" | "nut_free")[],
        favouriteCategory:   (category as "bread" | "pastry" | "cakes") || null,
        loyaltyOptIn,
        marketingOptIn,
      });
      utils.customers.getAll.invalidate();
      router.push(`/customers/${customer.id}/card`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    }
  }

  // ── Progress bar ────────────────────────────────────────────────────────────
  const progress = ((step - 1) / 2) * 100;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-4 pb-3 lg:px-8">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => step > 1 ? setStep((s) => (s - 1) as Step) : router.back()}
            className="p-2 -ml-1 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Register Customer</h1>
            <p className="text-xs text-gray-500">Step {step} of 3</p>
          </div>
        </div>
        {/* Progress */}
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${progress + 34}%` }} />
        </div>
      </div>

      <div className="flex-1 px-4 pt-6 pb-8 max-w-lg mx-auto w-full space-y-5 lg:px-8">
        {error && (
          <div className="rounded-xl bg-red-900/40 border border-red-700 text-red-300 px-4 py-3 text-sm">{error}</div>
        )}

        {/* ── Step 1: Contact details ────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">First name *</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Anna" autoFocus
                  className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Last name *</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                  placeholder="Hansen"
                  className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Phone <span className="text-gray-600">(phone or email required)</span></label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+47 123 45 678"
                className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="anna@example.com"
                className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Birthday <span className="text-gray-600">(for birthday reward)</span></label>
              <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
                className="w-full px-3 py-3 rounded-xl bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-brand-500" />
            </div>
            <button onClick={() => step1Valid() && setStep(2)} disabled={!step1Valid()}
              className="w-full py-4 rounded-xl bg-brand-500 text-white font-bold text-base hover:bg-brand-600 disabled:opacity-40 transition-colors">
              Continue →
            </button>
          </div>
        )}

        {/* ── Step 2: Preferences ──────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <p className="text-gray-400 text-sm">Optional — helps us personalise recommendations.</p>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">Dietary requirements</label>
              <div className="grid grid-cols-3 gap-2">
                {DIETARY_OPTIONS.map(({ value, label, icon }) => (
                  <button key={value} type="button" onClick={() => toggleDietary(value)}
                    className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border text-xs font-medium transition-colors ${
                      dietary.includes(value)
                        ? "bg-purple-900/50 border-purple-600 text-purple-300"
                        : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600"
                    }`}>
                    <span className="text-2xl">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-2">Favourite category</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORY_OPTIONS.map(({ value, label, icon }) => (
                  <button key={value} type="button" onClick={() => setCategory(category === value ? "" : value)}
                    className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border text-xs font-medium transition-colors ${
                      category === value
                        ? "bg-brand-900/50 border-brand-600 text-brand-300"
                        : "bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-600"
                    }`}>
                    <span className="text-2xl">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => setStep(3)}
              className="w-full py-4 rounded-xl bg-brand-500 text-white font-bold text-base hover:bg-brand-600 transition-colors">
              Continue →
            </button>
            <button onClick={() => setStep(3)} className="w-full py-2 text-sm text-gray-600 hover:text-gray-400 transition-colors">
              Skip preferences
            </button>
          </div>
        )}

        {/* ── Step 3: GDPR opt-ins ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <p className="text-gray-400 text-sm">You control how we contact you. These are separate consents.</p>

            {/* Loyalty opt-in */}
            <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
              loyaltyOptIn ? "border-brand-600 bg-brand-900/20" : "border-gray-800 bg-gray-900 hover:border-gray-600"
            }`}>
              <div className="mt-0.5">
                <input type="checkbox" checked={loyaltyOptIn} onChange={(e) => setLoyaltyOptIn(e.target.checked)}
                  className="w-5 h-5 rounded accent-brand-500" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-100">Join the loyalty programme</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Earn 1 point per NOK spent. Unlock rewards, birthday discounts, and tier benefits. You can opt out at any time.
                </p>
              </div>
            </label>

            {/* Marketing opt-in */}
            <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
              marketingOptIn ? "border-purple-600 bg-purple-900/20" : "border-gray-800 bg-gray-900 hover:border-gray-600"
            }`}>
              <div className="mt-0.5">
                <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}
                  className="w-5 h-5 rounded accent-purple-500" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-100">Marketing communications</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Receive offers, seasonal specials, and news by SMS or email. No spam — unsubscribe anytime.
                </p>
              </div>
            </label>

            <p className="text-[10px] text-gray-700 px-1">
              By registering you confirm this information is accurate. Your data is stored securely and used only as described. Consent is recorded with a timestamp. See our privacy policy for full details.
            </p>

            <button onClick={handleFinish} disabled={isPending}
              className="w-full py-4 rounded-xl bg-brand-500 text-white font-bold text-base hover:bg-brand-600 disabled:opacity-50 transition-colors">
              {isPending ? "Registering…" : "Register & get loyalty card"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
