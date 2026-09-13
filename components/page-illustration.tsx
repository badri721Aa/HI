export default function PageIllustration() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-0 -z-10 -translate-x-1/2" aria-hidden="true">
      <img
        src="/images/page-illustration.svg"
        className="max-w-none opacity-20"
        width={1440}
        height={427}
        alt=""
      />
    </div>
  )
}
