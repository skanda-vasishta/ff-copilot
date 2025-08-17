interface CardProps {
  children: React.ReactNode
  className?: string
}

interface CardHeaderProps extends CardProps {
  onClick?: () => void
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 text-black ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '', onClick }: CardHeaderProps) {
  return (
    <div className={`px-6 py-4 border-b border-gray-200 text-black ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}

export function CardContent({ children, className = '' }: CardProps) {
  return (
    <div className={`px-6 py-4 text-black ${className}`}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '' }: CardProps) {
  return (
    <div className={`px-6 py-4 border-t border-gray-200 text-black ${className}`}>
      {children}
    </div>
  )
} 