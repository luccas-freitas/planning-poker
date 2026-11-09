/** Índices nos cantos, como numa carta de baralho (só em telas maiores). */
export function CardCorners({ value }: { value: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute top-1 left-1.5 hidden text-[10px] leading-none font-semibold opacity-70 sm:block"
      >
        {value}
      </span>
      <span
        aria-hidden="true"
        className="absolute right-1.5 bottom-1 hidden rotate-180 text-[10px] leading-none font-semibold opacity-70 sm:block"
      >
        {value}
      </span>
    </>
  );
}
