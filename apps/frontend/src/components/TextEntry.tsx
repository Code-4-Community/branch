interface TextEntryProps {
  type?: string;
  placeholder?: string;
}

export const TextEntry = ({ type = "text", placeholder }: TextEntryProps) => {
  return (
    <input
      type={type}
      placeholder={placeholder}
      className="
        box-border
        flex flex-row items-center
        px-3 py-2 gap-2
        w-full h-10
        bg-core-white
        border border-[#AAAAAA]
        rounded
        font-body text-body text-core-black
        placeholder:text-black-400
        focus:outline-none focus:border-core-green
      "
    />
  );
};