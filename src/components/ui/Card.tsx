import type { HTMLAttributes } from 'react'
import { ui } from './tokens'

export const Card = ({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={`${ui.card.base} ${className}`} {...props} />
}

export const CardHeader = ({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={`${ui.card.header} ${className}`} {...props} />
}

export const CardBody = ({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={`${ui.card.body} ${className}`} {...props} />
}

