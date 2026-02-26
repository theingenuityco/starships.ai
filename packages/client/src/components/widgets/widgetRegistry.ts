'use client'

import React from 'react'

import { StatCard } from './StatCard'
import { DataTable } from './DataTable'
import { MetricGrid } from './MetricGrid'
import { AreaChart, BarChart, DonutChart, LineChart, PieChart, RadarChart, RadialChart } from './charts'
import { ConnectorSuggestionCard } from './ConnectorSuggestionCard'
import { AgentSuggestionCard } from './AgentSuggestionCard'
import { StarshipDetails } from './StarshipDetails'

import { Box } from './primitives/Box'
import { Stack } from './primitives/Stack'
import { Grid } from './primitives/Grid'
import { Text } from './primitives/Text'
import { ButtonWidget } from './primitives/ButtonWidget'
import { TabsWidget } from './primitives/TabsWidget'

export const WIDGET_REGISTRY: Record<string, React.ComponentType<any>> = {
  Box,
  Stack,
  Grid,
  Tabs: TabsWidget,
  Text,
  Button: ButtonWidget,
  StatCard,
  DataTable,
  MetricGrid,
  BarChart,
  LineChart,
  AreaChart,
  PieChart,
  DonutChart,
  RadarChart,
  RadialChart,
  ConnectorSuggestionCard,
  AgentSuggestionCard,
  StarshipDetails,
}

export const WIDGET_TYPES = Object.freeze(Object.keys(WIDGET_REGISTRY))

