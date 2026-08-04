import classNames from 'classnames';
import { colorPalette } from '@teambit/base-ui.theme.accent-color';
import styles from './input-text.module.scss';


export type ColorAccentProps = {
    /**
     * error style
     */
    error?: boolean;
    /**
     * success style
     */
    success?: boolean;
    /**
     * filled style
     */
    filled?: boolean;
  };

export const getAccent = ({ error, success }: ColorAccentProps) => {
  return (
    (error && classNames(colorPalette.error, styles.error)) ||
    (success && classNames(colorPalette.success, styles.success))
  );
};


export const classes = {
    container: styles.container,
    inputText: styles.inputText,
    inputTextWithIcon: styles.inputTextWithIcon,
    filled: styles.filled,
  };