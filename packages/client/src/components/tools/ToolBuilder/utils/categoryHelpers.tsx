import type { ToolTemplateCategory } from '@starships/protocol'
import { Bot, BarChart2, Users, Package, Wrench } from 'lucide-react'

export const getCategoryIcon = (category: ToolTemplateCategory) => {
  switch (category) {
    case 'automation':
      return <Bot className="w-5 h-5" />
    case 'data':
      return <BarChart2 className="w-5 h-5" />
    case 'communication':
      return <Users className="w-5 h-5" />
    case 'utility':
      return <Package className="w-5 h-5" />
    default:
      return <Wrench className="w-5 h-5" />
  }
}

export const getCategoryColor = (category: ToolTemplateCategory) => {
  const colors = {
    general: 'bg-gradient-to-r from-gray-500/10 to-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
    automation: 'bg-gradient-to-r from-green-500/10 to-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
    data: 'bg-gradient-to-r from-purple-500/10 to-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
    communication: 'bg-gradient-to-r from-orange-500/10 to-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
    coding: 'bg-gradient-to-r from-indigo-500/10 to-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
    creative: 'bg-gradient-to-r from-pink-500/10 to-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30',
    analysis: 'bg-gradient-to-r from-cyan-500/10 to-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
    support: 'bg-gradient-to-r from-amber-500/10 to-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
    utility: 'bg-gradient-to-r from-teal-500/10 to-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30',
  }
  return colors[category] || colors.general
}
