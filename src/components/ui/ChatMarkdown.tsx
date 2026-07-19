import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ChatMarkdownProps {
  content: string;
  variant: 'user' | 'assistant';
}

export default function ChatMarkdown({ content, variant }: ChatMarkdownProps) {
  const isUser = variant === 'user';

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em>{children}</em>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 last:mb-0 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 last:mb-0 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className={isUser ? 'underline' : 'text-blue-600 underline hover:text-blue-800'}>
            {children}
          </a>
        ),
        h1: ({ children }) => <h1 className="font-bold text-base mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="font-bold text-sm mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="font-semibold text-sm mb-1">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className={`border-l-2 pl-2 my-1 ${isUser ? 'border-white/50 text-white/80' : 'border-slate-300 text-slate-500'}`}>
            {children}
          </blockquote>
        ),
        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '');
          const codeString = String(children).replace(/\n$/, '');

          if (match) {
            return (
              <div className="my-2 rounded-lg overflow-hidden text-[12px] leading-relaxed">
                <div className={`flex items-center justify-between px-3 py-1 ${isUser ? 'bg-blue-800/50' : 'bg-slate-100 border border-slate-200'}`}>
                  <span className={`text-[10px] font-mono ${isUser ? 'text-blue-200' : 'text-slate-500'}`}>{match[1]}</span>
                </div>
                <SyntaxHighlighter
                  style={isUser ? oneDark : oneLight}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: 0, borderRadius: 0, fontSize: '12px' }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          }

          return (
            <code
              className={`px-1 py-0.5 rounded text-[12px] font-mono ${isUser ? 'bg-blue-800/40 text-blue-100' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}
              {...props}
            >
              {children}
            </code>
          );
        },
        hr: () => <hr className={`my-2 ${isUser ? 'border-white/20' : 'border-slate-200'}`} />,
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className={`text-[11px] border-collapse w-full ${isUser ? 'border-white/20' : 'border-slate-200'}`}>{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className={`border px-2 py-1 text-left font-semibold ${isUser ? 'border-white/20 bg-blue-800/30' : 'border-slate-200 bg-slate-50'}`}>{children}</th>
        ),
        td: ({ children }) => (
          <td className={`border px-2 py-1 ${isUser ? 'border-white/20' : 'border-slate-200'}`}>{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
