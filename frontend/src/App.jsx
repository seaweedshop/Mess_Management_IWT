import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

const api = async (path, options = {}) => {
  const token = localStorage.getItem("plate-token");
  const response = await fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const mealTypes = ["breakfast", "lunch", "snacks", "dinner"];
const currentDay = (new Date().getDay() + 6) % 7;

const Icon = ({ children, className = "" }) => (
  <span
    className={`inline-flex h-5 w-5 items-center justify-center text-base ${className}`}
    aria-hidden="true"
  >
    {children}
  </span>
);

const Card = ({ children, className = "" }) => (
  <div
    className={`rounded-[1.65rem] border border-black/[.07] bg-white p-5 shadow-[0_12px_35px_-24px_rgba(23,19,34,.45)] ${className}`}
  >
    {children}
  </div>
);

const Button = ({ children, variant = "dark", className = "", ...props }) => (
  <button
    className={`rounded-full px-5 py-2.5 text-sm font-bold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${
      variant === "light"
        ? "border border-black/10 bg-white hover:bg-black/[.03]"
        : variant === "lilac"
          ? "bg-[#dbacfc] text-[#171322] hover:bg-[#d29af7]"
          : "bg-[#171322] text-white hover:bg-[#302840]"
    } ${className}`}
    {...props}
  >
    {children}
  </button>
);
const Spinner = () => (
  <span
    className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-.15em]"
    aria-label="Loading"
  />
);

const Input = ({ className = "", ...props }) => (
  <input
    className={`w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-[#171322] ${className}`}
    {...props}
  />
);

const Select = ({ options, ...props }) => (
  <select
    className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-[#171322]"
    {...props}
  >
    {options.map((option) => (
      <option key={option}>{option}</option>
    ))}
  </select>
);

const Status = ({ value }) => (
  <span
    className={`status-badge rounded-full px-3 py-1 text-[11px] font-bold capitalize ${
      value === "paid" || value === "resolved"
        ? "status-paid bg-[#dff6e7] text-[#197240]"
        : value === "in-progress"
          ? "status-in-progress bg-[#fff0c8] text-[#8a6100]"
          : "status-pending bg-[#f0eafa] text-[#604979]"
    }`}
  >
    {value}
  </span>
);

function QrDialog({
  title,
  amount,
  data,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onClose,
  busy,
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(data, { width: 220, margin: 1 }).then(setSrc);
  }, [data]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#171322]/60 p-5">
      <div className="coupon-purchase-dialog qr-dialog w-full max-w-sm rounded-[1.65rem] bg-white p-6 text-center shadow-2xl">
        <p className="qr-dialog-label font-mono text-xs uppercase tracking-[.17em]">
          Offline payment
        </p>
        <h3 className="qr-dialog-title mt-2 text-xl font-extrabold">{title}</h3>
        <p className="qr-dialog-amount mt-2 text-3xl font-extrabold">₹{amount}</p>
        {src ? (
          <img
            className="mx-auto mt-5 rounded-xl bg-white p-2"
            src={src}
            alt="Payment QR code"
          />
        ) : (
          <div className="mx-auto mt-5 h-[220px] w-[220px] animate-pulse rounded-xl bg-black/10" />
        )}
        <p className="qr-dialog-note mt-4 text-xs">
          Scan this code or show it at the mess office.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="light" onClick={onClose}>
            Close
          </Button>
          {secondaryLabel && (
            <Button variant="light" disabled={busy || !src} onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
          <Button disabled={busy || !src} onClick={onAction}>
            {busy && <Spinner />}
            {busy ? "Updating…" : actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CouponDialog({ meal, onRate, onClose }) {
  const [coupon, setCoupon] = useState(null);
  const [couponLoaded, setCouponLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const item = meal.items.join(", ");
  const price = meal.price || 80;
  useEffect(() => {
    let active = true;
    api("/coupons")
      .then((coupons) => {
        if (!active) return;
        setCoupon(
          coupons.find(
            (entry) =>
              entry.day === meal.day &&
              entry.type === meal.type &&
              entry.item === item,
          ) || null,
        );
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setCouponLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [item, meal.day, meal.type]);
  const save = async (payNow) => {
    setBusy(true);
    try {
      const saved = await api("/coupons", {
        method: "POST",
        body: { meal: meal._id, day: meal.day, type: meal.type, item, price },
      });
      if (payNow && saved.status !== "paid") {
        await api(`/coupons/${saved._id}/pay`, { method: "PATCH" });
        setCoupon({ ...saved, status: "paid", paidOn: new Date().toISOString() });
      } else {
        setCoupon(saved);
      }
    } finally {
      setBusy(false);
    }
  };
  if (!couponLoaded) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#171322]/60 p-5">
        <div className="coupon-loading-dialog qr-dialog w-full max-w-sm rounded-[1.65rem] bg-white p-6 text-center shadow-2xl">
          <Spinner />
          <p className="coupon-loading-text mt-3 text-sm font-bold">
            Checking your coupon history…
          </p>
        </div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#171322]/60 p-5">
        <div className="qr-dialog w-full max-w-sm rounded-[1.65rem] bg-white p-6 text-center shadow-2xl dark:bg-[#211d2b]">
          <p className="qr-dialog-title text-sm font-bold">
            Could not check coupon history
          </p>
          <p className="qr-dialog-note mt-2 text-sm">{loadError}</p>
          <Button className="mt-5" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }
  if (coupon) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-[#171322]/60 p-5">
        <div className="coupon-status-dialog qr-dialog w-full max-w-sm rounded-[1.65rem] bg-white p-6 shadow-2xl dark:bg-[#211d2b]">
          <p className="qr-dialog-label font-mono text-xs uppercase tracking-[.17em]">
            Coupon status
          </p>
          <h3 className="qr-dialog-title mt-2 text-xl font-extrabold">{item}</h3>
          <p className="qr-dialog-note mt-2 text-sm">
            This coupon is already in your history.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="light" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => onRate(meal)}>Give feedback</Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <QrDialog
      title={`${days[meal.day]} ${meal.type} coupon`}
      amount={price}
      data={`platemate-coupon:${meal.day}:${meal.type}:${item}`}
      actionLabel="Buy coupon"
      secondaryLabel="Pay later"
      busy={busy}
      onClose={onClose}
      onAction={() => save(true)}
      onSecondary={() => save(false)}
    />
  );
}

const VegMark = ({ veg }) => (
  <span
    className={`inline-flex h-4 w-4 items-center justify-center rounded-[4px] border-2 ${veg ? "border-[#2a9b5b]" : "border-[#dc5b5b]"}`}
  >
    <i
      className={`h-1.5 w-1.5 rounded-full ${veg ? "bg-[#2a9b5b]" : "bg-[#dc5b5b]"}`}
    />
  </span>
);

function Auth({ onLogin }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (key) => (event) =>
    setForm({ ...form, [key]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api(`/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: form,
      });
      localStorage.setItem("plate-token", result.token);
      onLogin(result.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
      <section className="grain relative hidden overflow-hidden bg-[#dbacfc] p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 flex items-center gap-2 font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#171322] text-[#dbacfc]">
            P
          </span>{" "}
          plate<span className="text-white">mate</span>
        </div>
        <div className="relative z-10 max-w-xl pb-8">
          <p className="mb-5 font-mono text-xs uppercase tracking-[.25em]">
            IIIT Bhubaneswar / mess, made simple
          </p>
          <h1 className="text-6xl font-extrabold leading-[.98] tracking-[-.06em]">
            Know what’s
            <br />
            <span className="underline decoration-white decoration-4 underline-offset-8">
              on your plate.
            </span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-black/65">
            Your daily menu, mess fees, and a direct line to the mess team — all
            in one calm little space.
          </p>
        </div>
        <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full border-[34px] border-white/30" />
        <div className="absolute right-24 top-28 h-20 w-20 rotate-12 rounded-3xl border-2 border-black/15" />
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-2 font-extrabold tracking-tight lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#171322] text-[#dbacfc]">
              P
            </span>{" "}
            platemate
          </div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[.2em] text-black/45">
            {register ? "New student" : "Welcome back"}
          </p>
          <h2 className="text-4xl font-extrabold tracking-[-.05em]">
            {register ? "Create your account." : "Your mess, at a glance."}
          </h2>
          <p className="mt-3 text-sm leading-6 text-black/55">
            Use your official college email to continue.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-3">
            {register && (
              <>
                <Input
                  required
                  placeholder="Full name"
                  onChange={change("name")}
                />
                <Input
                  placeholder="Room / hostel (optional)"
                  onChange={change("room")}
                />
              </>
            )}
            <Input
              required
              type="email"
              placeholder="you@iiit-bh.ac.in"
              onChange={change("email")}
            />
            <Input
              required
              minLength="6"
              type="password"
              placeholder="Password (6+ characters)"
              onChange={change("password")}
            />
            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <Button disabled={busy} className="mt-2 w-full">
              {busy && <Spinner />}
              {busy ? "Saving…" : register ? "Create account" : "Log in"}
            </Button>
          </form>
          <button
            className="mt-5 text-sm font-semibold underline underline-offset-4"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Log in"
              : "New to PlateMate? Create account"}
          </button>
        </div>
      </section>
    </main>
  );
}

function Menu({ onRate, onBuy }) {
  const [menu, setMenu] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(currentDay);
  const [weekly, setWeekly] = useState(false);
  const load = () => {
    setLoading(true);
    return Promise.all([api("/menu"), api("/announcements")])
      .then(([m, a]) => {
        setMenu(m);
        setAnnouncements(a);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    const refresh = () => load();
    window.addEventListener("menu-updated", refresh);
    return () => window.removeEventListener("menu-updated", refresh);
  }, []);
  const mealsForDay = (selectedDay) =>
    mealTypes
      .map((type) =>
        menu.find((meal) => meal.day === selectedDay && meal.type === type),
      )
      .filter(Boolean);
  return (
    <div className="space-y-6">
      {loading && (
        <div className="rounded-2xl border border-[#dbacfc] bg-white p-5">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>Loading your menu</span>
            <Spinner />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f0e5f8]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#b66cf0]" />
          </div>
          <p className="mt-2 text-xs text-black/45">
            Fetching the latest menu from MongoDB…
          </p>
        </div>
      )}
      {announcements[0] && (
        <div className="flex items-center gap-3 rounded-2xl bg-[#171322] px-5 py-4 text-sm text-white">
          <Icon>✦</Icon>
          <span>
            <b>Mess update</b>
            <span className="ml-2 text-white/65">{announcements[0].text}</span>
          </span>
        </div>
      )}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[.2em] text-black/45">
            This week
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-[-.05em]">
            {weekly ? "Weekly menu" : `${days[day]} menu`}
          </h2>
        </div>
        <div className="flex rounded-full border border-black/10 bg-white p-1 text-sm">
          <button
            className={`rounded-full px-4 py-2 ${!weekly ? "bg-[#171322] text-white" : ""}`}
            onClick={() => setWeekly(false)}
          >
            Daily
          </button>
          <button
            className={`rounded-full px-4 py-2 ${weekly ? "bg-[#171322] text-white" : ""}`}
            onClick={() => setWeekly(true)}
          >
            Weekly
          </button>
        </div>
      </div>
      {!weekly && (
        <div className="hide-scrollbar flex gap-2 overflow-auto pb-1">
          {days.map((name, index) => (
            <button
              key={name}
              onClick={() => setDay(index)}
              className={`min-w-[58px] rounded-2xl px-3 py-2 text-sm font-bold ${day === index ? "bg-[#dbacfc]" : "border border-black/10 bg-white"}`}
            >
              <span className="block text-[11px] font-normal text-black/50">
                {index === currentDay ? "Today" : " "}
              </span>
              {name}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {mealTypes.map((type) => (
            <Card key={type} className="animate-pulse">
              <div className="h-3 w-24 rounded bg-black/10" />
              <div className="mt-5 h-5 w-3/4 rounded bg-black/10" />
              <div className="mt-5 h-3 w-1/2 rounded bg-black/10" />
            </Card>
          ))}
        </div>
      ) : weekly ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {days.map((name, index) => (
            <Card
              key={name}
              className={
                index === currentDay ? "border-[#dbacfc] bg-[#f7edff]" : ""
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <b>{name}</b>
                {index === currentDay && (
                  <span className="font-mono text-[10px] uppercase text-[#7b4e9a]">
                    Today
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {mealsForDay(index).map((meal) => (
                  <div key={meal._id} className="text-sm">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-black/50">
                      <VegMark veg={meal.veg} />
                      {meal.type}
                    </div>
                    <button
                      onClick={() => onBuy?.(meal)}
                      className="mt-1 text-left hover:text-[#6b398e] dark:hover:text-[#dbacfc]"
                    >
                      {meal.items.join(", ")}
                    </button>
                  </div>
                ))}
                {!mealsForDay(index).length && (
                  <p className="text-sm text-black/40">Menu coming soon</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {mealTypes.map((type) => {
            const meal = menu.find((x) => x.day === day && x.type === type);
            return (
              <Card key={type} className="group relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
                    {type}
                  </span>
                  {meal && <VegMark veg={meal.veg} />}
                </div>
                {meal ? (
                  <>
                    <button
                      onClick={() => onBuy?.(meal)}
                      className="mt-4 text-left text-lg font-bold leading-snug hover:text-[#6b398e] dark:hover:text-[#dbacfc]"
                    >
                      {meal.items.join(", ")}
                    </button>
                    <div className="mt-5 flex items-center gap-3 text-xs text-black/50">
                      <span>{meal.calories || "—"} kcal</span>
                      <span>·</span>
                      <span>{meal.protein || "—"}g protein</span>
                    </div>
                    {meal.allergens?.length > 0 && (
                      <p className="mt-2 text-xs text-[#b35050]">
                        Allergens: {meal.allergens.join(", ")}
                      </p>
                    )}{" "}
                    {onRate && (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => onBuy(meal)}
                          className="rounded-full bg-[#dbacfc] px-4 py-2 text-xs font-bold text-[#171322]"
                        >
                          Buy coupon · ₹{meal.price || 80}
                        </button>
                        <button
                          onClick={() => onRate(meal)}
                          className="text-xs font-bold underline underline-offset-4"
                        >
                          Rate this meal →
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-4 text-sm text-black/40">
                    No meal planned yet.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Fees() {
  const [fees, setFees] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = () =>
    Promise.all([api("/fees"), api("/coupons")]).then(([feeData, couponData]) => {
      setFees(feeData);
      setCoupons(couponData);
    });
  useEffect(() => {
    load();
  }, []);
  const pending = fees.filter((fee) => fee.status === "pending");
  const pendingCoupons = coupons.filter((coupon) => coupon.status === "pending");
  const outstandingTotal =
    pending.reduce((sum, fee) => sum + (fee.amount || 0), 0) +
    pendingCoupons.reduce((sum, coupon) => sum + (coupon.price || 0), 0);
  const payAll = async () => {
    setBusy(true);
    try {
      await Promise.all([
        ...pending.map((fee) =>
          api(`/fees/${fee._id}/pay`, { method: "PATCH" }),
        ),
        ...pendingCoupons.map((coupon) =>
          api(`/coupons/${coupon._id}/pay`, { method: "PATCH" }),
        ),
      ]);
      await load();
      setPaymentOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fees-page space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="fees-outstanding-card">
          <p className="fees-card-label text-xs uppercase tracking-[.17em]">
            Outstanding offline
          </p>
          <p className="fees-card-value mt-3 text-4xl font-extrabold tracking-[-.06em]">
            ₹{pending.reduce((sum, fee) => sum + (fee.amount || 0), 0)}
          </p>
          <p className="fees-card-note mt-2 text-xs">
            Pay at the mess office or accounts counter.
          </p>
        </Card>
        <Card>
          <p className="fees-card-label text-xs uppercase tracking-[.17em]">
            Payment history
          </p>
          <p className="fees-card-value mt-3 text-4xl font-extrabold tracking-[-.06em]">
            {fees.filter((fee) => fee.status === "paid").length}
            <span className="fees-paid-label ml-2 text-base font-medium">
              paid bills
            </span>
          </p>
          <p className="fees-card-note mt-2 text-xs">
            Payments are recorded offline by the mess team.
          </p>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Outstanding bills</h3>
            <span className="font-mono text-xs text-black/45">
              {pending.length + pendingCoupons.length} total
            </span>
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {pending.map((fee) => (
              <div key={fee._id} className="flex items-center justify-between gap-3 py-4">
                <div>
                  <b className="text-sm">{fee.month}</b>
                  <p className="mt-1 text-xs text-black/45 dark:text-white/65">
                    Mess fee · awaiting offline payment
                  </p>
                </div>
                <b>₹{fee.amount}</b>
              </div>
            ))}
            {pendingCoupons.map((coupon) => (
              <div key={coupon._id} className="flex items-center justify-between gap-3 py-4">
                <div>
                  <b className="text-sm">{coupon.item}</b>
                  <p className="mt-1 text-xs text-black/45 dark:text-white/65">
                    {days[coupon.day]} {coupon.type} coupon · pay later
                  </p>
                </div>
                <b>₹{coupon.price}</b>
              </div>
            ))}
            {!pending.length && !pendingCoupons.length && (
              <p className="py-6 text-sm text-black/45 dark:text-white/65">
                No outstanding bills.
              </p>
            )}
          </div>
        </Card>
        <Card className="h-fit lg:w-full">
          <p className="text-xs uppercase tracking-[.17em] text-black/45 dark:text-white/65">
            Net total
          </p>
          <p className="mt-3 text-4xl font-extrabold">₹{outstandingTotal}</p>
          <p className="mt-2 text-xs text-black/50 dark:text-white/65">
            Pay all outstanding mess fees and coupons together.
          </p>
          <Button
            className="mt-5 w-full"
            disabled={!outstandingTotal}
            onClick={() => setPaymentOpen(true)}
          >
            Pay outstanding
          </Button>
        </Card>
      </div>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Coupon history</h3>
          <span className="font-mono text-xs text-black/45">
            {coupons.length} total
          </span>
        </div>
        <div className="divide-y divide-black/5 dark:divide-white/10">
          {coupons.map((coupon) => (
            <div key={coupon._id} className="flex items-center justify-between gap-3 py-4">
              <div>
                <b className="text-sm">{coupon.item}</b>
                <p className="mt-1 text-xs text-black/45 dark:text-white/65">
                  {days[coupon.day]} {coupon.type} · ₹{coupon.price}
                </p>
              </div>
              <Status value={coupon.status} />
            </div>
          ))}
          {!coupons.length && (
            <p className="py-6 text-sm text-black/45 dark:text-white/65">
              No coupons bought yet.
            </p>
          )}
        </div>
      </Card>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">Fee history</h3>
          <span className="font-mono text-xs text-black/45">{fees.length} total</span>
        </div>
        <div className="divide-y divide-black/5 dark:divide-white/10">
          {fees.map((fee) => (
            <div key={fee._id} className="flex items-center justify-between gap-3 py-4">
              <div>
                <b className="text-sm">{fee.month}</b>
                <p className="mt-1 text-xs text-black/45 dark:text-white/65">
                  {fee.status === "paid"
                    ? `Paid ${new Date(fee.paidOn).toLocaleDateString()}`
                    : "Awaiting offline payment"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <b>₹{fee.amount}</b>
                <Status value={fee.status} />
              </div>
            </div>
          ))}
          {!fees.length && (
            <p className="py-6 text-sm text-black/45 dark:text-white/65">
              No fee statements yet.
            </p>
          )}
        </div>
      </Card>
      {paymentOpen && (
        <QrDialog
          title="Outstanding bills"
          amount={outstandingTotal}
          data={`platemate-outstanding:${pending.map((fee) => fee._id).join(",")}:${pendingCoupons.map((coupon) => coupon._id).join(",")}`}
          actionLabel="Mark as paid"
          busy={busy}
          onClose={() => setPaymentOpen(false)}
          onAction={payAll}
        />
      )}
    </div>
  );
}

function Feedback({ initialMeal }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    kind: initialMeal ? "rating" : "quality",
    rating: 5,
    meal: initialMeal ? `${days[initialMeal.day]} ${initialMeal.type}` : "",
  });
  const load = () => api("/feedback").then(setItems);
  useEffect(() => {
    load();
  }, []);
  const submit = async () => {
    setBusy(true);
    try {
      await api("/feedback", { method: "POST", body: form });
      setForm({ kind: "quality", rating: 5, meal: "" });
      await load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Card className="h-fit space-y-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
            Talk to the team
          </p>
          <h3 className="mt-1 text-xl font-extrabold">
            Something on your mind?
          </h3>
        </div>
        <Select
          options={["quality", "hygiene", "rating", "feedback"]}
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value })}
        />
        {form.kind === "rating" && (
          <>
            <Input
              placeholder="Meal, e.g. Tue lunch"
              value={form.meal}
              onChange={(e) => setForm({ ...form, meal: e.target.value })}
            />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((number) => (
                <button
                  key={number}
                  className={`text-2xl ${number <= form.rating ? "" : "opacity-20"}`}
                  onClick={() => setForm({ ...form, rating: number })}
                >
                  ★
                </button>
              ))}
            </div>
          </>
        )}
        <textarea
          className="w-full resize-none rounded-xl border border-black/10 px-3.5 py-3 text-sm outline-none focus:border-black"
          rows="5"
          placeholder="Tell us what happened…"
          value={form.text || ""}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.anon || false}
            onChange={(e) => setForm({ ...form, anon: e.target.checked })}
          />{" "}
          Submit anonymously
        </label>
        <Button disabled={!form.text || busy} onClick={submit}>
          {busy && <Spinner />}
          {busy ? "Saving…" : "Send feedback"}
        </Button>
      </Card>
      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item._id} className="!p-4">
            <div className="flex items-center justify-between gap-2">
              <b className="feedback-kind text-sm capitalize">
                {item.kind}
                {item.anon && " · anonymous"}
              </b>
              <Status value={item.status} />
            </div>
            <p className="mt-2 text-sm leading-6">{item.text}</p>
            {item.reply && (
              <p className="mt-3 rounded-xl bg-[#f5eaff] p-3 text-xs leading-5">
                <b>Mess team:</b> {item.reply}
              </p>
            )}
          </Card>
        ))}
        {!items.length && (
          <Card>
            <p className="text-sm text-black/45">
              Your submitted feedback will appear here.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function AdminPaymentsTable() {
  const [fees, setFees] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api("/fees").then(setFees);
  }, []);
  const approve = async (id) => {
    setBusy(id);
    setError("");
    try {
      const updated = await api(`/fees/${id}/paid`, { method: "PATCH" });
      if (!updated?._id) throw new Error("Payment approval failed");
      setFees((current) =>
        current.map((fee) => (fee._id === updated._id ? { ...fee, ...updated } : fee)),
      );
      window.dispatchEvent(new Event("payment-updated"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  };
  return (
    <Card className="mt-5 overflow-hidden !p-0">
      <div className="border-b border-black/5 p-5 dark:border-white/10">
        <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
          Offline payments
        </p>
        <h3 className="mt-1 font-bold">All fee statements</h3>
        <p className="mt-1 text-xs text-black/45">
          Payments are recorded here after the mess office receives cash or
          another offline payment.
        </p>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[.03] text-xs uppercase tracking-wider text-black/45 dark:bg-white/[.04]">
            <tr>
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Month</th>
              <th className="px-5 py-3 font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Paid on</th>
              <th className="px-5 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {fees.map((fee) => (
              <tr key={fee._id}>
                <td className="px-5 py-4 font-semibold">
                  {fee.user?.name || "Student"}
                  <span className="ml-2 text-xs font-normal text-black/45">
                    {fee.user?.email || ""}
                  </span>
                </td>
                <td className="px-5 py-4">{fee.month}</td>
                <td className="px-5 py-4">₹{fee.amount}</td>
                <td className="px-5 py-4">
                  <Status value={fee.status} />
                </td>
                <td className="px-5 py-4 text-black/55">
                  {fee.paidOn ? new Date(fee.paidOn).toLocaleDateString() : "—"}
                </td>
                <td className="px-5 py-4">
                  {fee.status === "pending" ? (
                    <Button
                      className="whitespace-nowrap px-4 py-2 text-xs"
                      disabled={busy === fee._id}
                      onClick={() => approve(fee._id)}
                    >
                      {busy === fee._id && <Spinner />}
                      {busy === fee._id ? "Approving…" : "Approve payment"}
                    </Button>
                  ) : (
                    <span className="text-xs text-black/45 dark:text-white/65">
                      Approved
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!fees.length && (
              <tr>
                <td
                  colSpan="6"
                  className="px-5 py-8 text-center text-sm text-black/45"
                >
                  No fee records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Admin() {
  const [meal, setMeal] = useState({ day: 0, type: "lunch", veg: true });
  const [announcement, setAnnouncement] = useState("");
  const [fee, setFee] = useState({});
  const [fees, setFees] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seedDialog, setSeedDialog] = useState(false);
  const load = () =>
    Promise.all([api("/fees"), api("/feedback")]).then(([f, b]) => {
      setFees(f);
      setFeedback(b);
    });
  useEffect(() => {
    load();
  }, []);
  const run = async (path, options) => {
    setBusy(true);
    setError("");
    try {
      await api(path, options);
      await load();
      if (path === "/menu/seed" || path === "/menu")
        window.dispatchEvent(new Event("menu-updated"));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card className="space-y-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
                Menu editor
              </p>
              <h3 className="mt-1 font-bold">Add a meal</h3>
              <p className="mt-1 text-xs text-black/45">
                Use the default loader if the current MongoDB menu is
                incomplete.
              </p>
            </div>
            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}
            <Button
              disabled={busy}
              variant="lilac"
              onClick={() => setSeedDialog(true)}
            >
              {busy && <Spinner />}
              {busy ? "Loading menu…" : "Load default Odia week"}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Select
                options={days}
                onChange={(e) =>
                  setMeal({ ...meal, day: days.indexOf(e.target.value) })
                }
              />
              <Select
                options={mealTypes}
                value={meal.type}
                onChange={(e) => setMeal({ ...meal, type: e.target.value })}
              />
            </div>
            <Input
              placeholder="Items, comma separated"
              onChange={(e) =>
                setMeal({
                  ...meal,
                  items: e.target.value.split(",").map((item) => item.trim()),
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Calories"
                onChange={(e) =>
                  setMeal({ ...meal, calories: +e.target.value })
                }
              />
              <Input
                type="number"
                placeholder="Protein (g)"
                onChange={(e) => setMeal({ ...meal, protein: +e.target.value })}
              />
            </div>
            <Input
              placeholder="Allergens, comma separated"
              onChange={(e) =>
                setMeal({
                  ...meal,
                  allergens: e.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={meal.veg}
                onChange={(e) => setMeal({ ...meal, veg: e.target.checked })}
              />{" "}
              Vegetarian meal
            </label>
            <Button
              onClick={() => run("/menu", { method: "POST", body: meal })}
            >
              {busy && <Spinner />}
              {busy ? "Saving…" : "Add meal"}
            </Button>
          </Card>
          <Card className="space-y-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
                Broadcast
              </p>
              <h3 className="mt-1 font-bold">Post an announcement</h3>
            </div>
            <Input
              value={announcement}
              placeholder="e.g. Sunday dinner starts at 7:30 PM"
              onChange={(e) => setAnnouncement(e.target.value)}
            />
            <Button
              disabled={!announcement || busy}
              variant="lilac"
              onClick={() =>
                run("/announcements", {
                  method: "POST",
                  body: { text: announcement },
                }).then(() => setAnnouncement(""))
              }
            >
              {busy && <Spinner />}
              {busy ? "Publishing…" : "Publish update"}
            </Button>
          </Card>
          <Card className="space-y-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
                Offline billing
              </p>
              <h3 className="mt-1 font-bold">Create fee for students</h3>
            </div>
            <Input
              placeholder="Month, e.g. Nov 2026"
              onChange={(e) => setFee({ ...fee, month: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Amount ₹"
              onChange={(e) => setFee({ ...fee, amount: +e.target.value })}
            />
            <Button
              disabled={busy}
              onClick={() => run("/fees", { method: "POST", body: fee })}
            >
              {busy && <Spinner />}
              {busy ? "Creating…" : "Create statements"}
            </Button>
          </Card>
        </div>
        <div className="space-y-5">
          <Card className="max-h-[32rem] overflow-auto">
            <h3 className="mb-3 font-bold">Open feedback</h3>
            {feedback.map((item) => (
              <div
                key={item._id}
                className="border-t border-black/5 py-3 text-sm"
              >
                <div className="flex justify-between gap-2">
                  <b className="feedback-kind capitalize">{item.kind}</b>
                  <span className="feedback-user text-xs text-black/45">
                    {item.user?.name || "Anonymous"}
                  </span>
                </div>
                <p className="my-2">{item.text}</p>
                <div className="flex gap-2">
                  <Select
                    options={["open", "in-progress", "resolved"]}
                    value={item.status}
                    onChange={(e) =>
                      run(`/feedback/${item._id}`, {
                        method: "PATCH",
                        body: { status: e.target.value, reply: item.reply },
                      })
                    }
                  />
                  <Input
                    placeholder="Reply and press Enter"
                    defaultValue={item.reply}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      run(`/feedback/${item._id}`, {
                        method: "PATCH",
                        body: { status: item.status, reply: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            ))}
            {!feedback.length && (
              <p className="text-sm text-black/45">No feedback to review.</p>
            )}
          </Card>
        </div>
      </div>
      {busy && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center">
          <div className="rounded-full bg-[#171322] px-4 py-2 text-xs font-bold text-white shadow-xl">
            <Spinner /> Saving to MongoDB…
          </div>
        </div>
      )}
      {seedDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-[1.75rem] bg-white p-6 shadow-2xl"
          >
            <p className="font-mono text-xs uppercase tracking-[.18em] text-black/45">
              Replace menu
            </p>
            <h3 className="mt-2 text-xl font-extrabold">Load the Odia week?</h3>
            <p className="mt-2 text-sm leading-6 text-black/55">
              This replaces the current menu in MongoDB with the complete
              default 7-day menu.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="light" onClick={() => setSeedDialog(false)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  setSeedDialog(false);
                  run("/menu/seed", { method: "POST" });
                }}
              >
                Load menu
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AdminOverview({ setTab }) {
  const [fees, setFees] = useState([]);
  const [menu, setMenu] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [chartHover, setChartHover] = useState(null);
  const loadOverview = () =>
    Promise.all([api("/fees"), api("/menu")])
      .then(([feeData, menuData]) => {
        setFees(feeData);
        setMenu(menuData);
      })
      .finally(() => setLoadingMenu(false));
  useEffect(() => {
    loadOverview();
    window.addEventListener("payment-updated", loadOverview);
    return () => window.removeEventListener("payment-updated", loadOverview);
  }, []);
  const pending = fees.filter((fee) => fee.status === "pending");
  const paid = fees.filter((fee) => fee.status === "paid");
  const paidDates = paid
    .map((fee) => (fee.paidOn ? new Date(fee.paidOn) : null))
    .filter(Boolean);
  const chartEnd = paidDates.length
    ? new Date(Math.max(...paidDates))
    : new Date();
  chartEnd.setHours(23, 59, 59, 999);
  const weeklyCounts = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(chartEnd);
    start.setDate(start.getDate() - (7 - index) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      label: `W${index + 1}`,
      count: paid.filter(
        (fee) =>
          fee.paidOn &&
          new Date(fee.paidOn) >= start &&
          new Date(fee.paidOn) < end,
      ).length,
    };
  });
  let runningTotal = 0;
  const weeks = weeklyCounts.map((week) => {
    runningTotal += week.count;
    return { ...week, count: runningTotal };
  });
  const maxPaid = Math.max(1, ...weeks.map((week) => week.count));
  const points = weeks
    .map(
      (week, index) => `${index * 40 + 10},${92 - (week.count / maxPaid) * 70}`,
    )
    .join(" ");
  const uniqueMenu = [
    ...new Map(menu.map((meal) => [`${meal.day}-${meal.type}`, meal])).values(),
  ];
  const vegByDay = days.map((_, day) => ({
    veg: uniqueMenu.filter((meal) => meal.day === day && meal.veg).length,
    nonVeg: uniqueMenu.filter((meal) => meal.day === day && !meal.veg).length,
  }));
  const maxMeals = Math.max(
    1,
    ...vegByDay.map((item) => Math.max(item.veg, item.nonVeg)),
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[.2em] text-black/45">
          Admin workspace
        </p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-[-.05em]">
          Keep the mess moving.
        </h2>
        <p className="mt-2 text-sm text-black/50">
          A quick read on collections, menu balance, and what needs attention.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="!bg-[#171322] text-white">
          <p className="text-xs uppercase tracking-[.16em] text-white/50">
            Pending bills
          </p>
          <p className="mt-3 text-4xl font-extrabold">{pending.length}</p>
          <p className="mt-1 text-xs text-white/50">
            ₹{pending.reduce((sum, fee) => sum + (fee.amount || 0), 0)}{" "}
            outstanding
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[.16em] text-black/45">
            Paid bills
          </p>
          <p className="paid-bills-value mt-3 text-4xl font-extrabold">{paid.length}</p>
          <p className="paid-bills-total mt-1 text-xs">
            ₹{paid.reduce((sum, fee) => sum + (fee.amount || 0), 0)} collected
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[.16em] text-black/45">
            Menu coverage
          </p>
          {loadingMenu ? (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f0e5f8]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-[#b66cf0]" />
              </div>
              <p className="mt-2 text-xs text-black/45">
                Loading from MongoDB…
              </p>
            </>
          ) : (
            <>
              {" "}
              <p className="mt-3 text-4xl font-extrabold">
                {uniqueMenu.length}
                <span className="ml-1 text-base font-medium text-black/40">
                  / 28
                </span>
              </p>
              <p className="mt-1 text-xs text-black/50">
                meals planned this week
              </p>
            </>
          )}
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
                Collections
              </p>
              <h3 className="mt-1 font-bold">Paid bills over weeks</h3>
            </div>
            <span className="rounded-full bg-[#e6f7ed] px-3 py-1 text-[11px] font-bold text-[#197240]">
              8 week view
            </span>
          </div>
          <div className="relative mt-5 h-44">
            <svg
              viewBox="0 0 300 110"
              className="h-full w-full"
              role="img"
              aria-label="Paid bills over the last eight weeks"
            >
              <path
                d="M10 92H290M10 57H290M10 22H290"
                stroke="#171322"
                strokeOpacity=".08"
              />
              <polyline
                points={points}
                fill="none"
                stroke="#b66cf0"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {weeks.map((week, index) => (
                <circle
                  key={week.label}
                  cx={index * 40 + 10}
                  cy={92 - (week.count / maxPaid) * 70}
                  r="3.5"
                  fill="#171322"
                  onMouseEnter={() =>
                    setChartHover({
                      text: `${week.label}: ${week.count} total paid bills`,
                      x: `${(index / 7) * 100}%`,
                    })
                  }
                  onMouseLeave={() => setChartHover(null)}
                />
              ))}
            </svg>
            {chartHover && (
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-[#171322] px-3 py-2 text-xs font-bold text-white"
                style={{ left: chartHover.x }}
              >
                {chartHover.text}
              </div>
            )}
            <div className="flex justify-between px-1 text-[10px] text-black/40">
              {weeks.map((week) => (
                <span key={week.label}>{week.label}</span>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
                Menu balance
              </p>
              <h3 className="mt-1 font-bold">Veg vs non-veg this week</h3>
            </div>{" "}
            <span className="font-mono text-xs text-black/40">
              {uniqueMenu.filter((meal) => meal.veg).length} /{" "}
              {uniqueMenu.filter((meal) => !meal.veg).length}
            </span>
          </div>
          <div className="relative mt-5 flex h-44 items-end justify-between gap-2">
            {vegByDay.map((item, index) => (
              <div
                key={days[index]}
                className="flex h-full flex-1 items-end justify-center gap-1"
                onMouseEnter={() =>
                  setChartHover({
                    text: `${days[index]}: ${item.veg} veg / ${item.nonVeg} non-veg`,
                    x: `${(index / 6) * 100}%`,
                  })
                }
                onMouseLeave={() => setChartHover(null)}
              >
                <div
                  className="w-3 rounded-t bg-[#dbacfc]"
                  style={{
                    height: `${Math.max(4, (item.veg / maxMeals) * 100)}%`,
                  }}
                />
                <div
                  className="w-3 rounded-t bg-[#171322]"
                  style={{
                    height: `${Math.max(4, (item.nonVeg / maxMeals) * 100)}%`,
                  }}
                />
              </div>
            ))}
            {chartHover && (
              <div
                className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-[#171322] px-3 py-2 text-xs font-bold text-white"
                style={{ left: chartHover.x }}
              >
                {chartHover.text}
              </div>
            )}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-black/40">
            {days.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-[10px] font-bold text-black/50">
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#dbacfc]" />
              Veg
            </span>
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#171322]" />
              Non-veg
            </span>
          </div>
        </Card>
      </div>
      <Card>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-mono text-xs uppercase tracking-[.17em] text-black/45">
              What needs attention
            </p>
            <h3 className="mt-1 font-bold">Manage the week from one place.</h3>
            <p className="mt-1 text-sm text-black/50">
              Update meals, post announcements, or record offline collections.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="lilac" onClick={() => setTab("Admin")}>
              Open admin tools
            </Button>
            <Button variant="light" onClick={() => setTab("Menu")}>
              Review menu
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Announcements() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/announcements")
      .then(setItems)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-xs uppercase tracking-[.2em] text-black/45">
          Mess updates
        </p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-[-.05em]">
          Announcements
        </h2>
        <p className="mt-2 text-sm text-black/50">
          Updates published by the mess team, newest first.
        </p>
      </div>
      {loading && (
        <Card className="flex items-center gap-3">
          <Spinner />
          <span className="text-sm">Loading announcements…</span>
        </Card>
      )}
      {error && (
        <Card>
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      )}
      {!loading && !error && !items.length && (
        <Card>
          <p className="text-sm text-black/45">
            No announcements have been published yet.
          </p>
        </Card>
      )}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map((announcement) => (
            <Card key={announcement._id} className="border-[#dbacfc]/50">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f2e5ff] text-[#6b398e]">
                  ✦
                </span>
                <div className="min-w-0">
                  <p className="font-semibold leading-6">{announcement.text}</p>
                  <p className="mt-2 text-xs text-black/45">
                    {announcement.createdAt
                      ? new Date(announcement.createdAt).toLocaleString()
                      : "Mess team update"}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Home({ user, setTab, setMeal }) {
  const [menu, setMenu] = useState([]);
  useEffect(() => {
    api("/menu").then(setMenu);
  }, []);
  const todayMeals = mealTypes
    .map((type) =>
      menu.find((meal) => meal.day === currentDay && meal.type === type),
    )
    .filter(Boolean);
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#dbacfc] p-7 sm:p-10">
        <div className="relative z-10 max-w-lg">
          <p className="font-mono text-xs uppercase tracking-[.2em] text-black/55">
            Good morning, {user.name.split(" ")[0]}
          </p>
          <h2 className="mt-3 text-4xl font-extrabold leading-[1.02] tracking-[-.06em] sm:text-5xl">
            A better day
            <br />
            starts with{" "}
            <span className="underline decoration-white decoration-4 underline-offset-8">
              good food.
            </span>
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-6 text-black/60">
            Here’s what’s cooking today. Check the full weekly rhythm whenever
            you need it.
          </p>
          <Button className="mt-6" onClick={() => setTab("Menu")}>
            See today’s menu <span className="ml-2">↗</span>
          </Button>
        </div>
        <div className="absolute -right-10 -top-20 h-72 w-72 rounded-full border-[30px] border-white/25" />
        <div className="absolute bottom-5 right-16 hidden rotate-[-12deg] text-8xl opacity-20 sm:block">
          ✦
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        <button onClick={() => setTab("Menu")} className="text-left">
          <Card className="h-full transition hover:-translate-y-1">
            <Icon className="mb-5 h-10 w-10 rounded-xl bg-[#f1e4ff]">☀</Icon>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-black/45">
              Today
            </p>
            <h3 className="mt-1 font-bold">View menu</h3>
            <p className="mt-2 text-xs text-black/50">
              {todayMeals.length} meals planned
            </p>
          </Card>
        </button>
        <button onClick={() => setTab("Fees")} className="text-left">
          <Card className="h-full transition hover:-translate-y-1">
            <Icon className="mb-5 h-10 w-10 rounded-xl bg-[#e6f7ed]">₹</Icon>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-black/45">
              Accounts
            </p>
            <h3 className="mt-1 font-bold">Mess fees</h3>
            <p className="mt-2 text-xs text-black/50">
              View statements & status
            </p>
          </Card>
        </button>
        <button onClick={() => setTab("Feedback")} className="text-left">
          <Card className="h-full transition hover:-translate-y-1">
            <Icon className="mb-5 h-10 w-10 rounded-xl bg-[#fff1ce]">↗</Icon>
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-black/45">
              Have a say
            </p>
            <h3 className="mt-1 font-bold">Send feedback</h3>
            <p className="mt-2 text-xs text-black/50">Report, rate, improve</p>
          </Card>
        </button>
      </div>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[.18em] text-black/45">
              Next up
            </p>
            <h3 className="mt-1 font-bold">Today’s meals</h3>
          </div>
          <button
            className="text-xs font-bold underline"
            onClick={() => setTab("Menu")}
          >
            Full menu →
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {todayMeals.map((meal) => (
            <button
              key={meal._id}
              className="rounded-2xl bg-[#fbf6ff] p-3 text-left"
              onClick={() => {
                setMeal(meal);
                setTab("Feedback");
              }}
            >
              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-black/45">
                <span>{meal.type}</span>
                <VegMark veg={meal.veg} />
              </div>
              <p className="mt-2 text-sm font-semibold">
                {meal.items.join(", ")}
              </p>
            </button>
          ))}
          {!todayMeals.length && (
            <p className="text-sm text-black/45">
              The menu team is updating today’s menu.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("Home");
  const [feedbackMeal, setFeedbackMeal] = useState(null);
  const [couponMeal, setCouponMeal] = useState(null);
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("plate-dark") === "1",
  );
  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    localStorage.setItem("plate-dark", darkMode ? "1" : "0");
  }, [darkMode]);
  useEffect(() => {
    const token = localStorage.getItem("plate-token");
    if (!token) {
      setReady(true);
      return;
    }
    api("/me")
      .then(setUser)
      .catch(() => localStorage.removeItem("plate-token"))
      .finally(() => setReady(true));
  }, []);
  if (!ready)
    return (
      <div className="grid min-h-screen place-items-center bg-[#fbf9ff] text-sm text-black/45">
        Loading PlateMate…
      </div>
    );
  if (!user) return <Auth onLogin={setUser} />;
  const tabs =
    user.role === "admin"
      ? [
          { id: "Home", label: "Overview", icon: "⌂" },
          { id: "Menu", label: "Menu", icon: "☀" },
          { id: "Admin", label: "Admin", icon: "⚙" },
        ]
      : [
          { id: "Home", label: "Overview", icon: "⌂" },
          { id: "Menu", label: "Menu", icon: "☀" },
          { id: "Announcements", label: "Updates", icon: "✦" },
          { id: "Fees", label: "Fees", icon: "₹" },
          { id: "Feedback", label: "Feedback", icon: "↗" },
        ];
  const logout = () => {
    localStorage.removeItem("plate-token");
    setUser(null);
  };
  return (
    <div className="min-h-screen bg-[#fbf9ff]">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-black/[.07] bg-white px-5 py-6 lg:flex">
        <div className="flex items-center gap-2 px-2 font-extrabold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#171322] text-[#dbacfc]">
            P
          </span>{" "}
          plate<span className="text-[#b66cf0]">mate</span>
        </div>
        <p className="mt-14 px-2 font-mono text-[10px] uppercase tracking-[.2em] text-black/35">
          Workspace
        </p>
        <nav className="mt-3 space-y-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setTab(item.id);
                setFeedbackMeal(null);
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${tab === item.id ? "bg-[#f2e5ff] text-[#6b398e]" : "text-black/55 hover:bg-black/[.03]"}`}
            >
              <Icon>{item.icon}</Icon>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-[#fbf6ff] p-4">
          <p className="truncate text-sm font-bold">{user.name}</p>
          <p className="mt-1 truncate text-xs text-black/45">{user.email}</p>
          <button className="mt-4 text-xs font-bold underline" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="pb-24 lg:ml-64 lg:pb-10">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-black/[.06] bg-[#fbf9ff]/90 px-5 py-4 backdrop-blur-md sm:px-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-black/40">
              IIIT-BH / mess portal
            </p>
            <h1 className="mt-1 text-xl font-extrabold tracking-[-.04em]">
              {tabs.find((item) => item.id === tab)?.label}
            </h1>
          </div>{" "}
          <div className="flex items-center gap-3">
            <button
              aria-label={
                darkMode ? "Switch to light mode" : "Switch to dark mode"
              }
              className="grid h-9 w-9 place-items-center rounded-full border border-black/10 bg-[#dbacfc] text-base text-[#171322] transition hover:scale-105 dark:border-white/20 dark:bg-[#342541] dark:text-white"
              onClick={() => setDarkMode(!darkMode)}
            >
              {darkMode ? "☀" : "☾"}
            </button>
            <span className="hidden text-right sm:block">
              <b className="block text-xs">{user.name}</b>
              <small className="text-[10px] uppercase tracking-wider text-black/40">
                {user.role}
              </small>
            </span>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#dbacfc] text-sm font-extrabold">
              {user.name[0]}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8">
          {tab === "Home" &&
            (user.role === "admin" ? (
              <AdminOverview setTab={setTab} />
            ) : (
              <Home user={user} setTab={setTab} setMeal={setFeedbackMeal} />
            ))}
          {tab === "Menu" && (
            <Menu
              onBuy={setCouponMeal}
              onRate={
                user.role === "admin"
                  ? undefined
                  : (meal) => {
                      setFeedbackMeal(meal);
                      setTab("Feedback");
                    }
              }
            />
          )}
          {tab === "Announcements" && user.role !== "admin" && (
            <Announcements />
          )}
          {tab === "Fees" && user.role !== "admin" && <Fees />}
          {tab === "Feedback" && user.role !== "admin" && (
            <Feedback initialMeal={feedbackMeal} />
          )}
          {tab === "Admin" && user.role === "admin" && (
            <>
              <Admin />
              <AdminPaymentsTable />
            </>
          )}
        </div>
      </main>
      <nav className="fixed inset-x-3 bottom-3 z-30 flex justify-around rounded-2xl border border-black/10 bg-white/95 p-2 shadow-xl backdrop-blur lg:hidden">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              setFeedbackMeal(null);
            }}
            className={`flex flex-col items-center rounded-xl px-3 py-2 text-[10px] font-bold ${tab === item.id ? "bg-[#f2e5ff] text-[#6b398e]" : "text-black/45"}`}
          >
            <Icon>{item.icon}</Icon>
            {item.label}
          </button>
        ))}
        <button
          onClick={logout}
          className="flex flex-col items-center rounded-xl px-3 py-2 text-[10px] font-bold text-black/45"
        >
          <Icon>↪</Icon>Exit
        </button>
      </nav>
      {couponMeal && (
        <CouponDialog
          meal={couponMeal}
          onClose={() => setCouponMeal(null)}
          onRate={(meal) => {
            setCouponMeal(null);
            setFeedbackMeal(meal);
            setTab("Feedback");
          }}
        />
      )}
    </div>
  );
}
