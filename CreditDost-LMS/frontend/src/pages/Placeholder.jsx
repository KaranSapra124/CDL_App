export default function Placeholder({ title, description, icon = "🚧" }) {
  return (
    <div className="mx-auto max-w-[1500px]">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mb-6 mt-0.5 text-[13px] text-mut">{description}</p>
      <div className="grid place-items-center rounded-xl border border-line bg-white py-20">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-3xl">
          {icon}
        </div>
        <p className="mt-4 text-[15px] font-semibold">This section is on the roadmap</p>
        <p className="mt-1 max-w-sm text-center text-[13px] text-mut">
          The backend for this tab isn't built yet. We'll wire it up once the data
          model is ready.
        </p>
      </div>
    </div>
  );
}
