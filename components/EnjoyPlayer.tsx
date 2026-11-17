import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Lock,
  Unlock,
  Maximize,
  Settings,
  ArrowRight,
  Volume2,
  VolumeX,
  Tv,
  Search,
  Check,
  AlertCircle,
  RefreshCw,
  SkipBack,
  SkipForward,
  Sun,
} from 'lucide-react-native';
import { getCapacitorPlugin, registerBackInterceptor } from '@/utils/backNavigation';

const PRESTIGE_GOLD = '#FFC72C';
const PRESTIGE_GOLD_DARK = '#E6A800';
const OBSIDIAN_SHEET = '#07080C';
