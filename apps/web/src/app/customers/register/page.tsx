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
  { value: "bread",  label: "Bread",  icon: "🍞" },
  { value: "pastry", label: "Pastry", icon: "🥐" },
  { value: "cakes",  label: "Cakes",  icon: "🎂" },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const { mutateAsync: register, isPending } = api.customers.register.useMutation();
  const utils = api.useUtils();

  const [step,  setStep]  = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [phone,     setPhone]     = useState("");
  const [email,     setEmail]     = useState("");
  const [birthday,  setBirthday]  = useState("");

  // Step 2
  const [dietary,  setDietary]  = useState<string[]>([]);
  const [category, setCategory] = useState("");

  // Step 3
  const [loyaltyOptIn,   setLoyaltyOptIn]   = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  function toggleDietary(val: string) {
    setDietary((prev) => prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]);
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

  const progress = ((step - 1) / 2) * 100;

  return (
    <div className="max-w-lg mx-auto space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => step > 1 ? setStep((s) => (s - 1) as Step) : router.back()}
            className="p-2 -ml-1 rounded-lg text-brand-400 hover:text-brand-600 hover:bg-rose-50 transition-colors"
          >←</button>
          <div>
            <h1 className="page-title">Register Customer</h1>
            <p className="text-xs text-brand-400">Step {step} of 3</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-rose-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${progress + 34}%` }} />
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {/* Step 1: Contact details */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">First name *</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                placeholder="Anna" autoFocus className="form-input" />
            </div>
            <div>
              <label className="form-label">Last name *</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                placeholder="Hansen" className="form-input" />
            </div>
          </div>
          <div>
            <label className="form-label">Phone <span className="text-brand-300 normal-case font-normal">(phone or email required)</span></label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+47 123 45 678" className="form-input" />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="anna@example.com" className="form-input" />
          </div>
          <div>
            <label className="form-label">Birthday <span className="text-brand-300 normal-case font-normal">(for birthday reward)</span></label>
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
              className="form-input" />
          </div>
          <button onClick={() => step1Valid() && setStep(2)} disabled={!step1Valid()}
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-base hover:bg-brand-700 disabled:opacity-40 transition-colors">
            Continue →
          </button>
        </div>
      )}

      {/* Step 2: Preferences */}
      {step === 2 && (
        <div className="space-y-5">
          <p className="text-brand-400 text-sm">Optional — helps us personalise recommendations.</p>

          <div>
            <label className="form-label">Dietary requirements</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {DIETARY_OPTIONS.map(({ value, label, icon }) => (
                <button key={value} type="button" onClick={() => toggleDietary(value)}
                  className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    dietary.includes(value)
                      ? "bg-purple-50 border-purple-300 text-purple-700"
                      : "bg-white border-rose-200 text-gray-500 hover:border-purple-200"
                  }`}>
                  <span className="text-2xl">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Favourite category</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {CATEGORY_OPTIONS.map(({ value, label, icon }) => (
                <button key={value} type="button" onClick={() => setCategory(category === value ? "" : value)}
                  className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border text-xs font-medium transition-colors ${
                    category === value
                      ? "bg-rose-50 border-brand-300 text-brand-700"
                      : "bg-white border-rose-200 text-gray-500 hover:border-brand-200"
                  }`}>
                  <span className="text-2xl">{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setStep(3)}
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-base hover:bg-brand-700 transition-colors">
            Continue →
          </button>
          <button onClick={() => setStep(3)} className="w-full py-2 text-sm text-brand-400 hover:text-brand-600 transition-colors">
            Skip preferences
          </button>
        </div>
      )}

      {/* Step 3: GDPR opt-ins */}
      {step === 3 && (
        <div className="space-y-5">
          <p className="text-brand-400 text-sm">You control how we contact you. These are separate consents.</p>

          <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
            loyaltyOptIn ? "border-brand-400 bg-rose-50" : "border-rose-200 bg-white hover:border-brand-200"
          }`}>
            <input type="checkbox" checked={loyaltyOptIn} onChange={(e) => setLoyaltyOptIn(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded accent-brand-500" />
            <div>
              <p className="font-semibold text-sm text-gray-800">Join the loyalty programme</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Earn 1 point per NOK spent. Unlock rewards, birthday discounts, and tier benefits. You can opt out at any time.
              </p>
            </div>
          </label>

          <label className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
            marketingOptIn ? "border-purple-300 bg-purple-50" : "border-rose-200 bg-white hover:border-purple-200"
          }`}>
            <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-0.5 w-5 h-5 rounded accent-purple-500" />
            <div>
              <p className="font-semibold text-sm text-gray-800">Marketing communications</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Receive offers, seasonal specials, and news by SMS or email. No spam — unsubscribe anytime.
              </p>
            </div>
          </label>

          <p className="text-[10px] text-brand-300 px-1">
            By registering you confirm this information is accurate. Your data is stored securely and used only as described. Consent is recorded with a timestamp.
          </p>

          <button onClick={handleFinish} disabled={isPending}
            className="w-full py-3 rounded-xl bg-brand-600 text-white font-bold text-base hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {isPending ? "Registering…" : "Register & get loyalty card"}
          </button>
        </div>
      )}
    </div>
  );
}
