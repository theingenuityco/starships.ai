import React from 'react'
import Icon from '@/components/primitives/Icon'

type Props = React.HTMLAttributes<HTMLElement> & { size?: number | string }

function toSize(props: any) {
  const { className, size, ...rest } = props || {}
  // Allow Tailwind width/height classes to control size; otherwise use size or CSS variable
  const finalSize = size ?? undefined
  return { finalSize, restProps: { className, ...rest } }
}

export function Sparkles(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="sparkles" size={finalSize} {...restProps} /> }
export function Bot(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="bot" size={finalSize} {...restProps} /> }
export function Wrench(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="wrench" size={finalSize} {...restProps} /> }
export function ChevronDown(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="chevron-down" size={finalSize} {...restProps} /> }
export function User(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="user" size={finalSize} {...restProps} /> }
export function X(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="x" size={finalSize} {...restProps} /> }
export function MessageSquare(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="message-square" size={finalSize} {...restProps} /> }
export function CheckCircle(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="check-circle" size={finalSize} {...restProps} /> }
export function Rocket(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="rocket" size={finalSize} {...restProps} /> }
export function Users(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="users" size={finalSize} {...restProps} /> }
export function Settings(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="settings" size={finalSize} {...restProps} /> }
export function Plus(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="plus" size={finalSize} {...restProps} /> }
export function Star(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="star" size={finalSize} {...restProps} /> }
export function BarChart2(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="bar-chart" size={finalSize} {...restProps} /> }
export function Trash2(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="trash" size={finalSize} {...restProps} /> }
export function Code(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="code" size={finalSize} {...restProps} /> }
export function Loader2(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="loading" size={finalSize} {...restProps} /> }
export function Key(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="key" size={finalSize} {...restProps} /> }
export function Shield(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="shield" size={finalSize} {...restProps} /> }
export function AlertTriangle(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="alert-triangle" size={finalSize} {...restProps} /> }
export function AlertCircle(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="alert-circle" size={finalSize} {...restProps} /> }
export function Clock(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="clock" size={finalSize} {...restProps} /> }
export function Search(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="search" size={finalSize} {...restProps} /> }
export function Eye(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="eye" size={finalSize} {...restProps} /> }
export function Check(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="check" size={finalSize} {...restProps} /> }
export function Lightbulb(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="lightbulb" size={finalSize} {...restProps} /> }
export function Activity(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="activity" size={finalSize} {...restProps} /> }
export function Info(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="info" size={finalSize} {...restProps} /> }
export function ChevronRight(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="chevron-right" size={finalSize} {...restProps} /> }
export function BarChart3(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="bar-chart3" size={finalSize} {...restProps} /> }
export function Calendar(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="calendar" size={finalSize} {...restProps} /> }
export function Package(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="package" size={finalSize} {...restProps} /> }
export function Zap(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="zap" size={finalSize} {...restProps} /> }
export function Download(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="download" size={finalSize} {...restProps} /> }
export function Brain(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="brain" size={finalSize} {...restProps} /> }
export function LogOut(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="log-out" size={finalSize} {...restProps} /> }
export function EyeOff(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="eye-off" size={finalSize} {...restProps} /> }
export function HeartPulse(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="heart-pulse" size={finalSize} {...restProps} /> }
export function Lock(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="lock" size={finalSize} {...restProps} /> }
export function Play(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="play" size={finalSize} {...restProps} /> }
export function Copy(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="copy" size={finalSize} {...restProps} /> }
export function FileText(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="file-text" size={finalSize} {...restProps} /> }
export function GitBranch(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="git-branch" size={finalSize} {...restProps} /> }
export function CheckCircle2(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="check-circle" size={finalSize} {...restProps} /> }
export function Store(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="store" size={finalSize} {...restProps} /> }
export function CreditCard(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="credit-card" size={finalSize} {...restProps} /> }
export function Settings2(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="settings" size={finalSize} {...restProps} /> }
export function Edit(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="edit" size={finalSize} {...restProps} /> }
export function MoreVertical(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="dots-vertical" size={finalSize} {...restProps} /> }
export function Palette(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="palette" size={finalSize} {...restProps} /> }
export function Headphones(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="headphones" size={finalSize} {...restProps} /> }
export function Globe(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="globe" size={finalSize} {...restProps} /> }
export function Send(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="send" size={finalSize} {...restProps} /> }
export function Wifi(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="wifi" size={finalSize} {...restProps} /> }
export function WifiOff(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="wifi-off" size={finalSize} {...restProps} /> }
export function LogIn(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="log-in" size={finalSize} {...restProps} /> }
export function Coins(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="coins" size={finalSize} {...restProps} /> }
export function ArrowDown(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="arrow-down" size={finalSize} {...restProps} /> }
export function ArrowUp(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="arrow-up" size={finalSize} {...restProps} /> }
export function Archive(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="archive" size={finalSize} {...restProps} /> }
export function ExternalLink(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="external-link" size={finalSize} {...restProps} /> }
export function MoreHorizontal(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="dots-horizontal" size={finalSize} {...restProps} /> }
export function Mail(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="mail" size={finalSize} {...restProps} /> }
export function Github(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="github" size={finalSize} {...restProps} /> }
export function Chrome(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="chrome" size={finalSize} {...restProps} /> }
export function RefreshCw(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="refresh" size={finalSize} {...restProps} /> }
export function Menu(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="menu" size={finalSize} {...restProps} /> }
export function Book(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="book" size={finalSize} {...restProps} /> }
export function Compass(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="compass" size={finalSize} {...restProps} /> }
export function Minus(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="minus" size={finalSize} {...restProps} /> }
export function TrendingUp(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="trending-up" size={finalSize} {...restProps} /> }
export function TestTube(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="test-tube" size={finalSize} {...restProps} /> }
export function Filter(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="filter" size={finalSize} {...restProps} /> }
export function Tag(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="tag" size={finalSize} {...restProps} /> }
export function RotateCcw(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="rotate-ccw" size={finalSize} {...restProps} /> }
export function Stars(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="stars" size={finalSize} {...restProps} /> }
export function UserPlus(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="user-plus" size={finalSize} {...restProps} /> }
export function Pause(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="pause" size={finalSize} {...restProps} /> }
export function MessageCircleMore(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="message-circle-more" size={finalSize} {...restProps} /> }
export function Mic(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="mic" size={finalSize} {...restProps} /> }
export function Paperclip(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="paperclip" size={finalSize} {...restProps} /> }
export function StopCircle(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="stop-circle" size={finalSize} {...restProps} /> }
export function Database(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="database" size={finalSize} {...restProps} /> }
export function Cog(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="cog" size={finalSize} {...restProps} /> }
export function Edit3(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="edit-3" size={finalSize} {...restProps} /> }
export function Split(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="split" size={finalSize} {...restProps} /> }
export function History(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="history" size={finalSize} {...restProps} /> }
export function Unlink(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="unlink" size={finalSize} {...restProps} /> }
export function Cpu(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="cpu" size={finalSize} {...restProps} /> }
export function Receipt(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="receipt" size={finalSize} {...restProps} /> }
export function Moon(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="moon" size={finalSize} {...restProps} /> }
export function Sun(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="sun" size={finalSize} {...restProps} /> }
export function Braces(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="braces" size={finalSize} {...restProps} /> }
export function ArrowLeft(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="arrow-left" size={finalSize} {...restProps} /> }
export function ArrowRight(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="arrow-right" size={finalSize} {...restProps} /> }
export function Circle(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="circle" size={finalSize} {...restProps} /> }
export function Bug(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="bug" size={finalSize} {...restProps} /> }
export function ChevronUp(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="chevron-up" size={finalSize} {...restProps} /> }
export function XCircle(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="x-circle" size={finalSize} {...restProps} /> }
export function ChevronLeft(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="chevron-left" size={finalSize} {...restProps} /> }
export function DotsVertical(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="dots-vertical" size={finalSize} {...restProps} /> }
export function DotsHorizontal(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="dots-horizontal" size={finalSize} {...restProps} /> }
export function ReloadCw(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="refresh" size={finalSize} {...restProps} /> }
export function InfoIcon(props: Props) { const { finalSize, restProps } = toSize(props); return <Icon name="info" size={finalSize} {...restProps} /> }
