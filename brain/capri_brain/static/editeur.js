"use strict";
(() => {
  // assets/face-trace.json
  var face_trace_default = { mask: [[[-6.63, -8.18], [-8.42, -5.74], [-7.35, -4.75], [-6.79, -3.99], [-6.34, -3.08], [-6.49, -7.02], [-6.42, -7.58], [-6.46, -8]], [[-6.57, -14.19], [-6.67, -14.4], [-6.94, -14.49], [-11.21, -14.21], [-13.89, -13.82], [-14.4, -13.52], [-14.55, -13.22], [-16.27, -11.35], [-16.43, -11.05], [-16.15, -10.84], [-14.46, -10.17], [-12.99, -9.34], [-11.78, -8.42], [-10.73, -7.38], [-10.12, -6.59], [-9.85, -6.51], [-7.73, -8.19], [-6.57, -9.26], [-6.46, -9.57]], [[29.53, -12.53], [29.46, -12.67], [28.78, -12.89], [23.93, -13.68], [19.37, -14.13], [19.06, -14.23], [18.64, -14.2], [17.59, -14.37], [13.06, -14.7], [12.34, -14.3], [12.08, -13.86], [11.07, -12.74], [10.69, -12.46], [10.35, -11.93], [8.92, -10.43], [8.82, -10.11], [9.43, -9.16], [9.69, -9.07], [11.73, -9.79], [14.29, -10.34], [16.02, -10.47], [19.02, -10.24], [21.45, -9.67], [23.51, -8.88], [26.04, -7.4], [26.6, -6.99], [26.71, -6.78], [26.19, -5.55], [24.74, -0.98], [23.31, 2.32], [22.3, 4.14], [21.52, 5.28], [20.39, 6.59], [19.36, 7.41], [19.28, 7.68], [20.1, 12.07], [19.92, 12.24], [19.47, 11.86], [17.36, 9.08], [17.03, 8.85], [15.36, 9.35], [13.96, 9.53], [12.45, 9.55], [10.25, 9.35], [8.45, 8.99], [4.68, 7.92], [2.15, 8.02], [2.01, 7.74], [2.31, 5.57], [2.98, 2.14], [3.58, -0.05], [4.74, -3.38], [5.3, -4.54], [6.56, -6.44], [7.74, -7.56], [7.78, -7.84], [7.48, -8.52], [7.37, -8.56], [5.53, -6.67], [4.19, -5.07], [0.61, -1.26], [-5.95, 6.16], [-6.58, 6.65], [-6.79, 6.41], [-6.46, 5.24], [-6.43, 4.26], [-6.29, 3.67], [-6.33, 3.08], [-6.71, 3.88], [-7.32, 4.67], [-7.54, 7.44], [-7.61, 7.65], [-7.74, 7.72], [-9.09, 7.4], [-10.64, 7.87], [-11.95, 8.14], [-13.95, 8.23], [-15.09, 8.15], [-16.07, 7.94], [-17.59, 7.44], [-18.18, 7.13], [-18.68, 7.43], [-19.92, 8.71], [-20.3, 8.99], [-20.46, 8.94], [-19.74, 6.21], [-21.03, 4.86], [-22.24, 2.71], [-22.65, 1.65], [-23, 0.26], [-23.27, -1.57], [-23.38, -3.35], [-23.52, -3.46], [-23.73, -3.35], [-24.39, -2.58], [-24.44, -2.25], [-22.38, 9.12], [-22.24, 9.4], [-21.97, 9.48], [-11.3, 9.34], [-10.86, 9.43], [-8.19, 9.43], [-2.28, 9.81], [6.73, 10.69], [20.94, 12.69], [21.21, 12.55], [22.49, 8.33], [24.96, 0.83]]], band: [[-30.32, -14.84], [30.32, -14.84], [27.82, 12.69], [-27.82, 12.69]], eyes: [{ c: [-13, 0], socket: [[[-22.33, -16.51], [-22.18, -16.56], [-21.62, -16.51], [-20.5, -16.1], [-19.94, -15.8], [-19.17, -15.54], [-18.46, -15.19], [-17.8, -14.73], [-17.29, -14.47], [-14.59, -12.54], [-12.55, -10.7], [-12.3, -10.55], [-10.87, -9.13], [-9.8, -8.26], [-9.49, -8.11], [-9.19, -8.11], [-8.88, -8.21], [-3.64, -11.06], [-3.18, -11.21], [-3.03, -11.21], [-2.92, -11.11], [-3.03, -10.81], [-3.43, -10.19], [-3.74, -9.89], [-4.25, -9.13], [-5.22, -7.95], [-6.59, -6.07], [-6.95, -5.71], [-7.3, -5.71], [-7.56, -5.87], [-7.66, -5.76], [-7.15, -5.15], [-6.69, -5], [-6.44, -4.74], [-6.03, -4.13], [-5.52, -3.11], [-5.22, -2.25], [-5.06, -1.59], [-5.06, -1.08], [-5.22, -0.77], [-5.22, 0.65], [-5.06, 0.81], [-4.76, 0.76], [-4.4, 1.27], [-4.25, 1.88], [-3.64, 3.56], [-3.48, 4.32], [-3.28, 4.78], [-2.82, 6.56], [-2.62, 7.73], [-2.62, 8.14], [-2.36, 9.31], [-2.36, 10.03], [-2.21, 10.69], [-2.26, 11.66], [-2.41, 11.86], [-2.67, 11.81], [-3.53, 11.2], [-4.86, 10.59], [-6.34, 10.28], [-8.73, 10.13], [-9.6, 9.98], [-11.38, 9.82], [-11.74, 9.67], [-12.65, 9.52], [-12.86, 9.41], [-13.31, 9.36], [-14.03, 9.16], [-15.1, 8.75], [-17.13, 7.73], [-17.39, 7.68], [-18.15, 7.89], [-21.67, 9.92], [-22.13, 9.98], [-22.18, 9.77], [-21.87, 8.91], [-21.06, 7.28], [-20.95, 6.92], [-20.45, 6.05], [-20.34, 5.54], [-20.6, 4.98], [-21.57, 3.81], [-22.58, 2.28], [-22.89, 1.57], [-23.35, 0.81], [-24.52, -10.14], [-24.52, -10.91], [-24.32, -12.03], [-23.81, -12.84], [-23.6, -13.66], [-23.3, -14.32], [-22.89, -15.59], [-22.48, -16.36]]], body: [[[-22.48, -16.51], [-21.67, -16.56], [-21.41, -16.41], [-20.8, -16.31], [-20.7, -16.15], [-20.45, -16.15], [-20.34, -16], [-20.04, -15.95], [-19.94, -15.8], [-19.63, -15.8], [-19.53, -15.64], [-19.38, -15.64], [-18.82, -15.34], [-18.66, -15.34], [-18.46, -15.24], [-18.41, -15.14], [-18.2, -15.08], [-18.15, -14.98], [-17.95, -14.93], [-17.8, -14.73], [-17.59, -14.73], [-17.54, -14.58], [-17.39, -14.58], [-17.24, -14.42], [-17.13, -14.42], [-17.03, -14.27], [-16.78, -14.17], [-16.47, -13.86], [-16.32, -13.86], [-16.27, -13.71], [-16.06, -13.66], [-15.96, -13.51], [-15.61, -13.35], [-15.5, -13.2], [-15.4, -13.2], [-15.15, -12.95], [-15, -12.95], [-14.94, -12.79], [-14.79, -12.79], [-14.79, -12.69], [-14.18, -12.13], [-13.57, -11.72], [-13.11, -11.21], [-12.91, -11.16], [-12.86, -11.01], [-12.6, -10.76], [-12.35, -10.65], [-11.89, -10.14], [-11.79, -10.14], [-11.79, -10.04], [-11.43, -9.69], [-11.28, -9.69], [-11.28, -9.58], [-11.02, -9.33], [-10.87, -9.33], [-10.77, -9.07], [-10.56, -9.02], [-10.51, -8.87], [-10.21, -8.72], [-10.16, -8.62], [-10, -8.62], [-7.15, -5.56], [-7.25, -5.51], [-7.1, -5.46], [-6.39, -4.74], [-6.34, -4.54], [-6.18, -4.44], [-6.13, -4.24], [-5.88, -3.98], [-5.88, -3.78], [-5.32, -2.66], [-5.27, -2.3], [-5.16, -2.25], [-5.06, -1.59], [-5.11, -0.62], [-4.96, -0.57], [-4.91, -0.16], [-4.81, -0.11], [-4.71, 0.55], [-4.6, 0.6], [-4.6, 0.96], [-4.4, 1.27], [-4.35, 1.52], [-4.25, 1.57], [-4.25, 1.88], [-4.04, 2.28], [-4.04, 2.49], [-3.89, 2.64], [-3.84, 3.05], [-3.74, 3.1], [-3.74, 3.35], [-3.64, 3.56], [-3.53, 4.12], [-3.43, 4.22], [-3.43, 4.47], [-3.18, 5.09], [-2.92, 6.26], [-2.82, 6.36], [-2.82, 6.82], [-2.67, 7.38], [-2.62, 8.14], [-2.47, 8.91], [-2.36, 9.06], [-2.36, 10.03], [-2.31, 10.33], [-2.21, 10.43], [-2.21, 11.71], [-2.26, 11.81], [-2.57, 11.86], [-3.08, 11.61], [-3.38, 11.3], [-3.64, 11.25], [-3.74, 11.1], [-3.99, 11.1], [-4.04, 10.94], [-4.3, 10.89], [-4.35, 10.79], [-4.5, 10.79], [-4.71, 10.64], [-5.62, 10.54], [-5.67, 10.43], [-6.03, 10.38], [-6.85, 10.38], [-7, 10.23], [-8.78, 10.23], [-8.83, 10.08], [-10.46, 10.03], [-10.56, 9.87], [-11.38, 9.87], [-11.53, 9.82], [-11.58, 9.72], [-11.89, 9.72], [-12.19, 9.57], [-13.31, 9.47], [-13.37, 9.36], [-13.52, 9.31], [-13.87, 9.31], [-13.93, 9.16], [-14.23, 9.16], [-14.33, 9.01], [-14.74, 8.96], [-14.84, 8.8], [-15.1, 8.8], [-15.25, 8.65], [-15.45, 8.65], [-15.56, 8.5], [-15.71, 8.5], [-15.96, 8.29], [-16.42, 8.24], [-16.47, 8.09], [-16.73, 8.04], [-16.83, 7.89], [-16.98, 7.89], [-17.13, 7.73], [-17.34, 7.73], [-17.44, 7.58], [-20.7, 4.98], [-20.7, 4.88], [-20.95, 4.63], [-21.06, 4.63], [-21.06, 4.42], [-21.21, 4.37], [-21.26, 4.17], [-21.57, 3.97], [-21.62, 3.66], [-21.77, 3.56], [-21.92, 3.25], [-22.13, 3.1], [-22.13, 2.9], [-22.28, 2.84], [-22.38, 2.59], [-22.53, 2.49], [-22.53, 2.34], [-22.69, 2.23], [-22.69, 2.03], [-22.84, 1.88], [-22.84, 1.72], [-22.99, 1.67], [-23.04, 1.32], [-23.2, 1.27], [-23.3, 0.86], [-23.4, 0.81], [-23.45, -0.21], [-23.55, -0.26], [-23.65, -2.2], [-23.76, -2.25], [-23.81, -3.68], [-23.91, -3.73], [-23.91, -4.64], [-24.01, -4.74], [-24.06, -6.12], [-24.16, -6.22], [-24.16, -6.68], [-24.27, -6.73], [-24.27, -8.11], [-24.37, -8.31], [-24.37, -9.13], [-24.47, -9.23], [-24.52, -9.74], [-24.52, -11.37], [-24.47, -11.72], [-24.37, -11.77], [-24.37, -12.08], [-24.27, -12.13], [-24.27, -12.38], [-24.01, -12.54], [-24.01, -12.64], [-23.91, -12.69], [-23.91, -12.84], [-23.81, -12.89], [-23.76, -13.3], [-23.65, -13.35], [-23.55, -14.01], [-23.45, -14.07], [-23.45, -14.22], [-23.3, -14.32], [-23.3, -14.73], [-23.2, -14.78], [-23.2, -15.08], [-23.09, -15.08], [-22.99, -15.29], [-22.99, -15.64], [-22.84, -15.7], [-22.84, -15.85], [-22.74, -15.9], [-22.69, -16.15], [-22.53, -16.26]]], lashes: [[[-3.23, -11.11], [-3.08, -10.96], [-3.23, -10.5], [-6.08, -6.73], [-6.95, -5.71], [-7.1, -5.1], [-7.41, -4.59], [-11.89, 1.06], [-14.43, 4.42], [-15.76, 6], [-16.73, 7.33], [-17.13, 7.68], [-17.8, 7.79], [-18.56, 8.14], [-21.51, 9.87], [-21.97, 9.92], [-22.13, 9.67], [-21.97, 9.11], [-20.5, 6.05], [-20.45, 5.54], [-20.55, 5.24], [-20.55, 4.88], [-20.39, 4.63], [-10.05, -7.9], [-9.7, -8.16], [-8.63, -8.36], [-5.11, -10.25], [-4.66, -10.55], [-3.64, -11.06]]], ring: { r: 7.8, w: 0.48 }, iris: { rx: 4.39, ry: 4.39, rot: 0 }, pupil: { d: [0.05, -0.13], r: 2.06 } }, { c: [13, 0], socket: [[[22.33, -16.51], [22.18, -16.56], [21.62, -16.51], [20.5, -16.1], [19.94, -15.8], [19.17, -15.54], [18.46, -15.19], [17.8, -14.73], [17.29, -14.47], [14.59, -12.54], [12.55, -10.7], [12.3, -10.55], [10.87, -9.13], [9.8, -8.26], [9.49, -8.11], [9.19, -8.11], [8.88, -8.21], [3.64, -11.06], [3.18, -11.21], [3.03, -11.21], [2.92, -11.11], [3.03, -10.81], [3.43, -10.19], [3.74, -9.89], [4.25, -9.13], [5.22, -7.95], [6.59, -6.07], [6.95, -5.71], [7.3, -5.71], [7.56, -5.87], [7.66, -5.76], [7.15, -5.15], [6.69, -5], [6.44, -4.74], [6.03, -4.13], [5.52, -3.11], [5.22, -2.25], [5.06, -1.59], [5.06, -1.08], [5.22, -0.77], [5.22, 0.65], [5.06, 0.81], [4.76, 0.76], [4.4, 1.27], [4.25, 1.88], [3.64, 3.56], [3.48, 4.32], [3.28, 4.78], [2.82, 6.56], [2.62, 7.73], [2.62, 8.14], [2.36, 9.31], [2.36, 10.03], [2.21, 10.69], [2.26, 11.66], [2.41, 11.86], [2.67, 11.81], [3.53, 11.2], [4.86, 10.59], [6.34, 10.28], [8.73, 10.13], [9.6, 9.98], [11.38, 9.82], [11.74, 9.67], [12.65, 9.52], [12.86, 9.41], [13.31, 9.36], [14.03, 9.16], [15.1, 8.75], [17.13, 7.73], [17.39, 7.68], [18.15, 7.89], [21.67, 9.92], [22.13, 9.98], [22.18, 9.77], [21.87, 8.91], [21.06, 7.28], [20.95, 6.92], [20.45, 6.05], [20.34, 5.54], [20.6, 4.98], [21.57, 3.81], [22.58, 2.28], [22.89, 1.57], [23.35, 0.81], [24.52, -10.14], [24.52, -10.91], [24.32, -12.03], [23.81, -12.84], [23.6, -13.66], [23.3, -14.32], [22.89, -15.59], [22.48, -16.36]]], body: [[[22.48, -16.51], [21.67, -16.56], [21.41, -16.41], [20.8, -16.31], [20.7, -16.15], [20.45, -16.15], [20.34, -16], [20.04, -15.95], [19.94, -15.8], [19.63, -15.8], [19.53, -15.64], [19.38, -15.64], [18.82, -15.34], [18.66, -15.34], [18.46, -15.24], [18.41, -15.14], [18.2, -15.08], [18.15, -14.98], [17.95, -14.93], [17.8, -14.73], [17.59, -14.73], [17.54, -14.58], [17.39, -14.58], [17.24, -14.42], [17.13, -14.42], [17.03, -14.27], [16.78, -14.17], [16.47, -13.86], [16.32, -13.86], [16.27, -13.71], [16.06, -13.66], [15.96, -13.51], [15.61, -13.35], [15.5, -13.2], [15.4, -13.2], [15.15, -12.95], [15, -12.95], [14.94, -12.79], [14.79, -12.79], [14.79, -12.69], [14.18, -12.13], [13.57, -11.72], [13.11, -11.21], [12.91, -11.16], [12.86, -11.01], [12.6, -10.76], [12.35, -10.65], [11.89, -10.14], [11.79, -10.14], [11.79, -10.04], [11.43, -9.69], [11.28, -9.69], [11.28, -9.58], [11.02, -9.33], [10.87, -9.33], [10.77, -9.07], [10.56, -9.02], [10.51, -8.87], [10.21, -8.72], [10.16, -8.62], [10, -8.62], [7.15, -5.56], [7.25, -5.51], [7.1, -5.46], [6.39, -4.74], [6.34, -4.54], [6.18, -4.44], [6.13, -4.24], [5.88, -3.98], [5.88, -3.78], [5.32, -2.66], [5.27, -2.3], [5.16, -2.25], [5.06, -1.59], [5.11, -0.62], [4.96, -0.57], [4.91, -0.16], [4.81, -0.11], [4.71, 0.55], [4.6, 0.6], [4.6, 0.96], [4.4, 1.27], [4.35, 1.52], [4.25, 1.57], [4.25, 1.88], [4.04, 2.28], [4.04, 2.49], [3.89, 2.64], [3.84, 3.05], [3.74, 3.1], [3.74, 3.35], [3.64, 3.56], [3.53, 4.12], [3.43, 4.22], [3.43, 4.47], [3.18, 5.09], [2.92, 6.26], [2.82, 6.36], [2.82, 6.82], [2.67, 7.38], [2.62, 8.14], [2.47, 8.91], [2.36, 9.06], [2.36, 10.03], [2.31, 10.33], [2.21, 10.43], [2.21, 11.71], [2.26, 11.81], [2.57, 11.86], [3.08, 11.61], [3.38, 11.3], [3.64, 11.25], [3.74, 11.1], [3.99, 11.1], [4.04, 10.94], [4.3, 10.89], [4.35, 10.79], [4.5, 10.79], [4.71, 10.64], [5.62, 10.54], [5.67, 10.43], [6.03, 10.38], [6.85, 10.38], [7, 10.23], [8.78, 10.23], [8.83, 10.08], [10.46, 10.03], [10.56, 9.87], [11.38, 9.87], [11.53, 9.82], [11.58, 9.72], [11.89, 9.72], [12.19, 9.57], [13.31, 9.47], [13.37, 9.36], [13.52, 9.31], [13.87, 9.31], [13.93, 9.16], [14.23, 9.16], [14.33, 9.01], [14.74, 8.96], [14.84, 8.8], [15.1, 8.8], [15.25, 8.65], [15.45, 8.65], [15.56, 8.5], [15.71, 8.5], [15.96, 8.29], [16.42, 8.24], [16.47, 8.09], [16.73, 8.04], [16.83, 7.89], [16.98, 7.89], [17.13, 7.73], [17.34, 7.73], [17.44, 7.58], [20.7, 4.98], [20.7, 4.88], [20.95, 4.63], [21.06, 4.63], [21.06, 4.42], [21.21, 4.37], [21.26, 4.17], [21.57, 3.97], [21.62, 3.66], [21.77, 3.56], [21.92, 3.25], [22.13, 3.1], [22.13, 2.9], [22.28, 2.84], [22.38, 2.59], [22.53, 2.49], [22.53, 2.34], [22.69, 2.23], [22.69, 2.03], [22.84, 1.88], [22.84, 1.72], [22.99, 1.67], [23.04, 1.32], [23.2, 1.27], [23.3, 0.86], [23.4, 0.81], [23.45, -0.21], [23.55, -0.26], [23.65, -2.2], [23.76, -2.25], [23.81, -3.68], [23.91, -3.73], [23.91, -4.64], [24.01, -4.74], [24.06, -6.12], [24.16, -6.22], [24.16, -6.68], [24.27, -6.73], [24.27, -8.11], [24.37, -8.31], [24.37, -9.13], [24.47, -9.23], [24.52, -9.74], [24.52, -11.37], [24.47, -11.72], [24.37, -11.77], [24.37, -12.08], [24.27, -12.13], [24.27, -12.38], [24.01, -12.54], [24.01, -12.64], [23.91, -12.69], [23.91, -12.84], [23.81, -12.89], [23.76, -13.3], [23.65, -13.35], [23.55, -14.01], [23.45, -14.07], [23.45, -14.22], [23.3, -14.32], [23.3, -14.73], [23.2, -14.78], [23.2, -15.08], [23.09, -15.08], [22.99, -15.29], [22.99, -15.64], [22.84, -15.7], [22.84, -15.85], [22.74, -15.9], [22.69, -16.15], [22.53, -16.26]]], lashes: [[[3.23, -11.11], [3.08, -10.96], [3.23, -10.5], [6.08, -6.73], [6.95, -5.71], [7.1, -5.1], [7.41, -4.59], [11.89, 1.06], [14.43, 4.42], [15.76, 6], [16.73, 7.33], [17.13, 7.68], [17.8, 7.79], [18.56, 8.14], [21.51, 9.87], [21.97, 9.92], [22.13, 9.67], [21.97, 9.11], [20.5, 6.05], [20.45, 5.54], [20.55, 5.24], [20.55, 4.88], [20.39, 4.63], [10.05, -7.9], [9.7, -8.16], [8.63, -8.36], [5.11, -10.25], [4.66, -10.55], [3.64, -11.06]]], ring: { r: 7.8, w: 0.48 }, iris: { rx: 4.39, ry: 4.39, rot: 0 }, pupil: { d: [-0.05, -0.13], r: 2.06 } }], bbox: [-24.44, -14.7, 29.53, 12.69], lashAngle: -34.7 };

  // src/renderer/character/geometry.ts
  var Mat = class _Mat {
    constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
    }
    a;
    b;
    c;
    d;
    e;
    f;
    static identity() {
      return new _Mat();
    }
    clone() {
      return new _Mat(this.a, this.b, this.c, this.d, this.e, this.f);
    }
    mul(m) {
      return new _Mat(
        this.a * m.a + this.c * m.b,
        this.b * m.a + this.d * m.b,
        this.a * m.c + this.c * m.d,
        this.b * m.c + this.d * m.d,
        this.a * m.e + this.c * m.f + this.e,
        this.b * m.e + this.d * m.f + this.f
      );
    }
    translate(x, y) {
      return this.mul(new _Mat(1, 0, 0, 1, x, y));
    }
    rotate(r) {
      const c = Math.cos(r), s = Math.sin(r);
      return this.mul(new _Mat(c, s, -s, c, 0, 0));
    }
    scale(x, y = x) {
      return this.mul(new _Mat(x, 0, 0, y, 0, 0));
    }
    apply([x, y]) {
      return [this.a * x + this.c * y + this.e, this.b * x + this.d * y + this.f];
    }
    map(p) {
      return p.map((v) => this.apply(v));
    }
  };
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function toPath(p) {
    const path = new Path2D();
    if (!p.length) return path;
    path.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) path.lineTo(p[i][0], p[i][1]);
    path.closePath();
    return path;
  }
  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = s + 1831565813 >>> 0;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/renderer/character/palette.ts
  var PALETTE = {
    hair: "#fb2f6c",
    // pink-crimson hair slabs (a touch pinker than the screencaps, as the owner asked)
    hairDeep: "#d11a52",
    // slightly darker slab variant (depth)
    violet: "#8a3dff",
    // offset outline / chromatic shadow
    violetDeep: "#5a24c4",
    ink: "#0a0710",
    // head, body, spikes
    inkSoft: "#1a1230",
    // subtle body facet
    mask: "#22f27a",
    // neon green face mask & body panels
    maskBright: "#7dffb4",
    iris: "#1d6cff",
    irisCore: "#0b1a4a",
    white: "#ffffff",
    sparkle: "#ffe6ee",
    mouthInner: "#2a0f3a"
  };

  // src/renderer/character/face.ts
  var DEFAULT_FACE = {
    bandTilt: -11,
    bandWidth: 22,
    bandHeight: 17,
    bandY: -5,
    bandSlant: 3,
    bandTopExtra: 3,
    bandCurve: 2.5,
    eyeSpacing: 12,
    eyeY: -5,
    socketW: 9.5,
    socketH: 7,
    socketTurn: 24,
    socketRound: 1,
    socketRoundB: 1,
    socketHB: 1,
    socketSkew: 0,
    socketTips: 0,
    ringR: 5.6,
    ringWidth: 0.55,
    iris: 0.7,
    glint: 0.27,
    lashLength: 5.5,
    lashWidth: 2.4,
    lashAngle: 12,
    mouthGap: 4,
    mouthSize: 1.1,
    mouthLine: 0.5,
    chinLength: 16,
    hairGap: 0,
    fringeLocks: 9,
    spriteBody: 1,
    faceScale: 1.1,
    headScale: 1.15,
    faceX: 0,
    faceY: 0,
    faceAngle: 0,
    hairFront: 1,
    skeleton: 1,
    faceTraced: 1,
    eyeMirror: 1,
    lashScale: 1.3,
    lashTopScale: 2.2,
    eyeGap: 2.5,
    eyeTurn: -10,
    eyeShiftY: 0,
    crossLashAngle: face_trace_default.lashAngle ?? -25,
    // measured on the reference eye
    ...Object.fromEntries([
      "torso",
      "head",
      "hair",
      "upperArmL",
      "forearmL",
      "handL",
      "upperArmR",
      "forearmR",
      "handR",
      "thighL",
      "shinL",
      "footL",
      "thighR",
      "shinR",
      "footR"
    ].map((b) => [`p_${b}`, 0])),
    maskColor: "#22f27a",
    irisColor: "#1d6cff",
    hairColor: "#fb2f6c"
  };
  var cfg = { ...DEFAULT_FACE };
  var listeners = [];
  function getFaceConfig() {
    return cfg;
  }
  function setFaceConfig(next) {
    const merged = { ...DEFAULT_FACE };
    for (const k of Object.keys(DEFAULT_FACE)) {
      const v = next[k] ?? cfg[k];
      if (typeof v === typeof DEFAULT_FACE[k] && (typeof v !== "string" || /^#[0-9a-f]{6}$/i.test(v)) && (typeof v !== "number" || Number.isFinite(v))) merged[k] = v;
    }
    cfg = merged;
    for (const l of listeners) l(cfg);
  }
  function headPoly(F, ownHair) {
    const W = F.bandWidth + Math.max(0, F.bandTopExtra) + Math.max(0, F.bandCurve) + 3;
    const top = F.bandY - F.bandHeight / 2 - (ownHair ? Math.max(5, F.hairGap + 3) : 1), bot = F.bandY + F.bandHeight / 2, ch = F.chinLength;
    return [
      [-W, top],
      [-W - 2, F.bandY],
      [-W + 1, bot + 2],
      [-W * 0.6, bot + ch * 0.6],
      [-W * 0.2, bot + ch * 0.95],
      [W * 0.05, bot + ch],
      [W * 0.3, bot + ch * 0.85],
      [W * 0.7, bot + ch * 0.5],
      [W + 1, bot],
      [W + 2, F.bandY - 2],
      [W - 1, top]
    ];
  }
  var LOCKS = [
    // x (share of band half-width), half base, length factor, lean
    [-0.92, 2.8, 1, -0.5],
    [0, 1.8, 0.8, 0.35],
    [0.9, 3.2, 1.2, 0.55]
    // band ends and centre: clear of the eyes
  ];
  function fringePoly(F) {
    const W = F.bandWidth + 12, edge = F.bandY - F.bandHeight / 2 - F.hairGap;
    const pts = [[-W, -52], [-W, edge]];
    for (const [fx, half] of LOCKS) {
      const x = fx * F.bandWidth;
      pts.push([x - half - 2.5, edge - 1.2], [x - half, edge]);
    }
    pts.push([W, edge], [W, -52]);
    return pts;
  }
  function lockPolys(F) {
    const edge = F.bandY - F.bandHeight / 2 - F.hairGap;
    return LOCKS.map(([fx, half, k, lean]) => {
      const x = fx * F.bandWidth, L = F.fringeLocks * k;
      return [[x - half, edge - 3], [x - half, edge], [x + lean * L, edge + L], [x + half, edge], [x + half, edge - 3]];
    });
  }
  var FLAKES = (() => {
    const r = prng(4242), out = [];
    for (let i = 0; i < 70; i++) out.push([-36 + r() * 72, -48 + r() * 40, 0.25 + r() ** 3 * 1.1]);
    return out;
  })();
  var MANY = [
    [0, -12, 0.61, 0.05, 0],
    [-22, 4, 0.52, 0.15, -0.3],
    [22, 4, 0.52, 0.2, 0.3],
    [-4, 6, 0.43, 0.3, 0.1],
    [8, -16, 0.41, 0.4, -0.2],
    [-20, -15, 0.43, 0.45, 0.25],
    [20, -15, 0.43, 0.5, -0.25],
    [0, 3, 0.36, 0.6, 0],
    [-12, 8, 0.32, 0.7, 0.4],
    [12, 8, 0.32, 0.75, -0.4]
  ];
  var rad = (deg2) => deg2 * Math.PI / 180;
  function clipOutFace(ctx2, head, F) {
    const hw = F.bandWidth / 2 + 3, top = F.bandY - F.bandHeight / 2, mid = F.bandY + F.bandHeight / 2, bot = mid + F.chinLength + 3;
    const pts = [[-hw, top], [hw, top], [hw, mid], [hw * 0.75, mid + F.chinLength * 0.6], [hw * 0.4, bot], [-hw * 0.4, bot], [-hw * 0.75, mid + F.chinLength * 0.6], [-hw, mid]].map((q) => head.apply(q));
    ctx2.beginPath();
    ctx2.rect(-1e5, -1e5, 2e5, 2e5);
    ctx2.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx2.lineTo(x, y);
    ctx2.closePath();
    ctx2.clip("evenodd");
  }
  var faceOutline = true;
  function drawFace(ctx2, head, p, S, paintHair, ownHair = true, mouthMode = "with") {
    const F = cfg;
    const tilt = rad(F.bandTilt);
    const turn = ([x, y]) => {
      const dy = y - F.bandY;
      return [x * Math.cos(tilt) - dy * Math.sin(tilt), x * Math.sin(tilt) + dy * Math.cos(tilt) + F.bandY];
    };
    const yaw = clamp(p.headYaw + p.turn * 0.4, -1, 1);
    const fx = yaw * 4, fy = p.headPitch * 4, squeeze = 1 - Math.abs(yaw) * 0.12;
    const face = (poly, depth = 1) => poly.map(([x, y]) => [x * squeeze + fx * depth, y + fy * depth]);
    const drawMouth = () => {
      const mc = face([mouthSpot(F, tilt)])[0];
      mouth(ctx2, head.translate(mc[0], mc[1]).scale(F.mouthSize), p, S * F.mouthSize);
    };
    if (mouthMode === "only") {
      const { plate: plate2, bandPoly: bandPoly2 } = plateAndBand(F, tilt, ownHair);
      const hp2 = head.map(face(plate2, 0.35));
      const below = [[-200, F.eyeY], [200, F.eyeY], [200, 200], [-200, 200]];
      const notBand = new Path2D();
      notBand.addPath(toPath(head.map(face([[-400, -400], [400, -400], [400, 400], [-400, 400]]))));
      notBand.addPath(toPath(head.map(face(bandPoly2))));
      ctx2.save();
      ctx2.clip(toPath(head.map(face(below.map(turn)))));
      ctx2.clip(notBand, "evenodd");
      if (faceOutline) {
        ctx2.fillStyle = PALETTE.violet;
        ctx2.fill(toPath(hp2.map(([x, y]) => [x - 1.6 * S, y + 2 * S])));
      }
      ctx2.fillStyle = PALETTE.ink;
      ctx2.fill(toPath(hp2));
      ctx2.restore();
      drawMouth();
      return;
    }
    if (F.faceTraced >= 0.5) {
      drawTraced(ctx2, head, p, S, F, face, tilt);
      if (mouthMode === "with") drawMouth();
      return;
    }
    const { plate, bandPoly } = plateAndBand(F, tilt, ownHair);
    const hp = head.map(face(plate, 0.35));
    if (faceOutline) {
      ctx2.fillStyle = PALETTE.violet;
      ctx2.fill(toPath(hp.map(([x, y]) => [x - 1.6 * S, y + 2 * S])));
    }
    ctx2.fillStyle = PALETTE.ink;
    ctx2.fill(toPath(hp));
    const band = head.map(face(bandPoly));
    const glow = clamp(p.maskGlow, 0, 1);
    ctx2.save();
    ctx2.clip(toPath(hp));
    if (glow > 0.35) {
      ctx2.shadowColor = F.maskColor;
      ctx2.shadowBlur = (glow - 0.35) * 16 * S;
    }
    ctx2.fillStyle = F.maskColor;
    ctx2.fill(toPath(band));
    ctx2.restore();
    const hair = (shape) => {
      if (paintHair) {
        paintHair(shape);
        return;
      }
      ctx2.fillStyle = F.hairColor;
      ctx2.fill(shape);
      ctx2.save();
      ctx2.clip(shape);
      ctx2.fillStyle = PALETTE.white;
      for (const [x, y, r] of FLAKES) {
        const [X, Y] = head.apply(face([[x, y]], 0.5)[0]);
        ctx2.beginPath();
        ctx2.arc(X, Y, r * S, 0, Math.PI * 2);
        ctx2.fill();
      }
      ctx2.restore();
    };
    if (ownHair) hair(toPath(head.map(face(fringePoly(F).map(turn), 0.5))));
    const eyes = [[turn([-F.eyeSpacing, F.eyeY]), 1.04], [turn([F.eyeSpacing, F.eyeY]), 0.96]];
    for (const [c, size] of eyes) {
      const far = (c[0] < 0 ? yaw > 0 : yaw < 0) ? 1 - Math.abs(yaw) * 0.25 : 1;
      eye(ctx2, head, face([c])[0], c[0] < 0 ? -1 : 1, far, size, p, c[0] < 0 ? p.blinkL : p.blinkR, tilt, 0, true);
    }
    if (ownHair && F.fringeLocks > 0.2) {
      const locks = new Path2D();
      for (const l of lockPolys(F)) locks.addPath(toPath(head.map(face(l.map(turn), 0.5))));
      hair(locks);
    }
    if (p.manyEyes > 0.03) {
      ctx2.save();
      ctx2.clip(toPath(band));
      for (const [x, y, sc, th, rot] of MANY) {
        const grow = clamp((p.manyEyes - th) / 0.12, 0, 1);
        if (grow > 0) eye(ctx2, head, face([[x, y]])[0], x < 0 ? -1 : 1, 1, sc * (0.6 + 0.4 * grow), { ...p, squint: p.squint * 0.5 }, 0, tilt, rot, false);
      }
      ctx2.restore();
    }
    if (mouthMode === "with") drawMouth();
  }
  var TRACE = face_trace_default;
  function mirrorEye(src, dst) {
    const [sx, sy] = src.c, [dx, dy] = dst.c;
    return {
      c: dst.c,
      socket: src.socket.map((poly) => poly.map(([x, y]) => [dx - (x - sx), dy + (y - sy)])),
      body: src.body?.map((poly) => poly.map(([x, y]) => [dx - (x - sx), dy + (y - sy)])),
      lashes: src.lashes?.map((poly) => poly.map(([x, y]) => [dx - (x - sx), dy + (y - sy)])),
      ring: src.ring,
      iris: { ...src.iris, rot: -src.iris.rot },
      pupil: { d: [-src.pupil.d[0], src.pupil.d[1]], r: src.pupil.r }
    };
  }
  function plateAndBand(F, tilt, ownHair) {
    const turnAt = (cy) => ([x, y]) => {
      const dy = y - cy;
      return [x * Math.cos(tilt) - dy * Math.sin(tilt), x * Math.sin(tilt) + dy * Math.cos(tilt) + cy];
    };
    if (F.faceTraced >= 0.5) {
      const k = 2 * F.eyeSpacing / 26, [bx0, by0, bx1, by1] = TRACE.bbox;
      const hF = { ...F, bandWidth: Math.max(-bx0, bx1) * k, bandHeight: (by1 - by0) * k, bandY: F.eyeY + (by0 + by1) / 2 * k, bandTopExtra: 0, bandCurve: 0 };
      const t = turnAt(F.eyeY);
      return { plate: headPoly(hF, false), bandPoly: (TRACE.band ?? TRACE.mask[0]).map(([x, y]) => t([x * k, y * k + F.eyeY])) };
    }
    const hw = F.bandWidth, hh = F.bandHeight / 2, y0 = F.bandY, te = F.bandTopExtra;
    const tl = [-hw - te, y0 - hh], tr = [hw + te - F.bandSlant, y0 - hh], br = [hw, y0 + hh], bl = [-hw + F.bandSlant, y0 + hh];
    const bow = (a, b, out) => {
      const pts = [];
      for (let i = 1; i < 10; i++) {
        const t = i / 10, k = 4 * t * (1 - t);
        pts.push([a[0] + (b[0] - a[0]) * t + out * F.bandCurve * k, a[1] + (b[1] - a[1]) * t]);
      }
      return pts;
    };
    return { plate: headPoly(F, ownHair), bandPoly: [tl, tr, ...bow(tr, br, 1), br, bl, ...bow(bl, tl, -1)].map(turnAt(F.bandY)) };
  }
  function mouthSpot(F, tilt) {
    if (F.faceTraced >= 0.5) return [0, F.eyeY + TRACE.bbox[3] * (2 * F.eyeSpacing / 26) + F.mouthGap];
    const y = F.bandY + F.bandHeight / 2 + F.mouthGap, dy = y - F.bandY;
    return [-dy * Math.sin(tilt), dy * Math.cos(tilt) + F.bandY];
  }
  function drawTraced(ctx2, head, p, S, F, face, tilt) {
    const k = 2 * F.eyeSpacing / 26;
    const [bx0, by0, bx1, by1] = TRACE.bbox;
    const cy = F.eyeY;
    const tr = ([x, y]) => {
      const X = x * k, Y = y * k;
      return [X * Math.cos(tilt) - Y * Math.sin(tilt), X * Math.sin(tilt) + Y * Math.cos(tilt) + cy];
    };
    const hF = { ...F, bandWidth: Math.max(-bx0, bx1) * k, bandHeight: (by1 - by0) * k, bandY: cy + (by0 + by1) / 2 * k, bandTopExtra: 0, bandCurve: 0 };
    const hp = head.map(face(headPoly(hF, false), 0.35));
    if (faceOutline) {
      ctx2.fillStyle = PALETTE.violet;
      ctx2.fill(toPath(hp.map(([x, y]) => [x - 1.6 * S, y + 2 * S])));
    }
    ctx2.fillStyle = PALETTE.ink;
    ctx2.fill(toPath(hp));
    const glow = clamp(p.maskGlow, 0, 1);
    const band = toPath(head.map(face((TRACE.band ?? TRACE.mask[0]).map(tr))));
    ctx2.save();
    ctx2.clip(toPath(hp));
    if (glow > 0.35) {
      ctx2.shadowColor = F.maskColor;
      ctx2.shadowBlur = (glow - 0.35) * 16 * S;
    }
    ctx2.fillStyle = F.maskColor;
    ctx2.fill(band);
    ctx2.restore();
    const wide = clamp(p.eyeWide, 0, 1), sq = clamp(p.squint, 0, 1);
    const eyes = F.eyeMirror >= 0.5 ? [mirrorEye(TRACE.eyes[1], TRACE.eyes[0]), TRACE.eyes[1]] : TRACE.eyes;
    const px = Math.hypot(head.a, head.b);
    eyes.forEach((e, i) => {
      const blink = i === 0 ? p.blinkL : p.blinkR;
      const shut = clamp(Math.max(blink, p.sleep * 0.9), 0, 1);
      const openT = clamp((1 - shut) * (1 - sq * 0.55), 0, 1), openB = clamp((1 - shut) * (1 - sq * 0.3), 0, 1);
      const sideSign = e.c[0] < 0 ? -1 : 1;
      const ecx = e.c[0] + sideSign * F.eyeGap, ecy = e.c[1] + F.eyeShiftY;
      const rot = rad(F.eyeTurn) * sideSign, cr = Math.cos(rot), sr = Math.sin(rot);
      const [ex, ey] = tr([ecx, ecy]);
      const at = (lx, ly) => tr([ecx + lx * cr - ly * sr, ecy + lx * sr + ly * cr]);
      const shapes = e.socket;
      const socket = new Path2D();
      for (const poly of shapes) socket.addPath(toPath(head.map(face(poly.map(([x, y]) => at(x - e.c[0], y - e.c[1]))))));
      const keep = new Path2D();
      keep.rect(-1e5, -1e5, 2e5, 2e5);
      const lozenge = new Path2D();
      for (const poly of e.body?.length ? e.body : shapes) lozenge.addPath(toPath(head.map(face(poly.map(([x, y]) => at(x - e.c[0], y - e.c[1]))))));
      const body = (e.body?.length ? e.body : shapes).flat();
      const hw = Math.max(...body.map(([x]) => Math.abs(x - e.c[0])));
      const Ht = Math.max(...body.map(([, y]) => e.c[1] - y)), Hb = Math.max(...body.map(([, y]) => y - e.c[1]));
      const [cX, cY] = head.apply(face([at(0, 0)])[0]);
      const rim = (Math.max(...body.map(([x, y]) => Math.hypot(x - e.c[0], y - e.c[1]))) + 0.4) * k * px;
      const crossLash = () => {
        const ang = rad(F.crossLashAngle) * (i === 0 ? -1 : 1);
        const up = e.ring.r * (1 + 0.55 * F.lashTopScale), down = e.ring.r * (1 + 0.9 * F.lashScale);
        const a = [Math.sin(ang) * up, -Math.cos(ang) * up], b = [-Math.sin(ang) * down, Math.cos(ang) * down];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]), wl = 0.9;
        const nx = -(b[1] - a[1]) / len * wl, ny = (b[0] - a[0]) / len * wl;
        ctx2.fillStyle = PALETTE.ink;
        ctx2.fill(toPath(head.map(face([a, [nx, ny], b, [-nx, -ny]].map(([x, y]) => at(x, y))))));
      };
      void crossLash;
      const lidsMove = openT < 0.99 || openB < 0.99;
      ctx2.save();
      ctx2.clip(keep);
      ctx2.fillStyle = PALETTE.ink;
      if (!lidsMove) ctx2.fill(socket, "evenodd");
      else if (e.lashes?.length) {
        for (const poly of e.lashes) ctx2.fill(toPath(head.map(face(poly.map(([x, y]) => at(x - e.c[0], y - e.c[1]))))));
      }
      const W = hw * 1.08;
      const edge = (h, sign) => {
        const pts = [];
        for (let j = 0; j <= 20; j++) {
          const x = -W + 2 * W * j / 20;
          pts.push([x, sign * h * Math.sqrt(Math.max(0, 1 - (x / W) ** 2))]);
        }
        return pts;
      };
      const top = edge(Ht * 1.15 * openT, -1), bot = edge(Hb * 1.15 * openB, 1);
      if (openT + openB > 0.03) {
        ctx2.save();
        if (lidsMove) ctx2.clip(lozenge);
        void rim;
        void cX;
        void cY;
        if (lidsMove) ctx2.clip(toPath(head.map(face([...top, ...[...bot].reverse()].map(([x, y]) => at(x, y))))));
        ctx2.fillStyle = PALETTE.ink;
        ctx2.fill(socket, "evenodd");
        ctx2.clip(socket, "evenodd");
        const gx = p.gazeX * e.ring.r * 0.3, gy = p.gazeY * e.ring.r * 0.25;
        const circle = (lx, ly, r, col) => {
          const [X, Y] = head.apply(face([at(lx, ly)])[0]);
          ctx2.beginPath();
          ctx2.arc(X, Y, r * k * px, 0, Math.PI * 2);
          ctx2.fillStyle = col;
          ctx2.fill();
        };
        const R = e.ring.r * (1 + wide * 0.06);
        circle(0, 0, R, F.maskColor);
        circle(0, 0, R - e.ring.w, PALETTE.ink);
        const ir = (e.iris.rx + e.iris.ry) / 2 * 1.05;
        const room = Math.max(0, R - e.ring.w - ir - 0.3), gl = Math.hypot(gx, gy);
        const ix = gl > room ? gx / gl * room : gx, iy = gl > room ? gy / gl * room : gy;
        if (p.blankEyes > 0.5) circle(ix, iy, R * 0.6, PALETTE.white);
        else {
          circle(ix, iy, ir, F.irisColor);
          circle(ix + e.pupil.d[0], iy + e.pupil.d[1], e.pupil.r * (1 - wide * 0.3), PALETTE.white);
        }
        ctx2.restore();
        if (lidsMove && shut < 0.9) {
          ctx2.save();
          ctx2.beginPath();
          ctx2.arc(cX, cY, rim, 0, Math.PI * 2);
          ctx2.clip();
          ctx2.clip(socket, "evenodd");
          ctx2.strokeStyle = PALETTE.ink;
          ctx2.lineWidth = 1.2 * k * px;
          ctx2.lineCap = "round";
          for (const line of [top, bot]) {
            const pts = head.map(face(line.map(([x, y]) => at(x, y))));
            ctx2.beginPath();
            ctx2.moveTo(pts[0][0], pts[0][1]);
            for (const q of pts.slice(1)) ctx2.lineTo(q[0], q[1]);
            ctx2.stroke();
          }
          ctx2.restore();
        }
      }
      ctx2.restore();
      if (shut > 0.9) {
        const lid = [], under = [];
        const half = hw * 0.9;
        for (let j = 0; j <= 14; j++) {
          const x = -half + 2 * half * j / 14, kk = 1 - (x / half) ** 2;
          lid.push(at(x, (2.6 * kk - 0.8) / k));
          under.push(at(x, (2.6 * kk - 0.8 + 1.8 * kk) / k));
        }
        void ex;
        void ey;
        ctx2.fillStyle = PALETTE.ink;
        ctx2.fill(toPath(head.map(face([...lid, ...under.reverse()]))));
      }
    });
  }
  function eye(ctx2, head, c, side, xScale, size, p, blink, tilt, extraRot, lash) {
    const F = cfg;
    const shut = clamp(Math.max(blink, p.sleep * 0.9), 0, 1);
    const sq = clamp(p.squint, 0, 1), wide = clamp(p.eyeWide, 0, 1);
    const m = head.translate(c[0], c[1]).rotate(tilt + extraRot).scale(xScale * size, size);
    const lz = m.rotate(-side * rad(F.socketTurn));
    const w = F.socketW;
    const hTop = F.socketH * (1 + wide * 0.25) * (1 - sq * 0.6) * (1 - shut);
    const hBot = F.socketH * F.socketHB * (1 + wide * 0.2) * (1 - sq * 0.45) * (1 - shut);
    const R = F.ringR * (1 + wide * 0.08);
    const drawLash = () => {
      if (!lash) return;
      const a = rad(F.lashAngle) * -side, edge = F.socketH, reach = edge + Math.max(0.5, F.lashLength);
      const base = F.lashWidth / (1 - edge / reach) / 2;
      const dx = Math.sin(a), dy = -Math.cos(a), nx = -dy, ny = dx;
      const at = (d, o) => [dx * d + nx * o, dy * d + ny * o];
      ctx2.fillStyle = PALETTE.ink;
      ctx2.fill(toPath(m.map([at(reach, 0), at(0, base), at(-reach, 0), at(0, -base)])));
    };
    drawLash();
    ctx2.fillStyle = PALETTE.ink;
    if (hTop + hBot < 1.4) {
      const lid = [], under = [];
      for (let i = 0; i <= 14; i++) {
        const x = -w + 2 * w * i / 14, k = 1 - (x / w) ** 2;
        lid.push([x, 2.6 * k - 0.8]);
        under.push([x, 2.6 * k - 0.8 + 1.8 * k]);
      }
      ctx2.fill(toPath(m.map([...lid, ...under.reverse()])));
      return;
    }
    if (p.happyEyes > 0.5) {
      const arc = [];
      for (let i = 0; i <= 12; i++) {
        const x = -w + 2 * w * i / 12;
        arc.push([x, -F.socketH * 0.7 * (1 - (x / w) ** 2) + F.socketH * 0.25]);
      }
      const t = 2.4;
      ctx2.fill(toPath(m.map([...arc.map(([x, y]) => [x, y - t / 2]), ...[...arc].reverse().map(([x, y]) => [x, y + t / 2])])));
      return;
    }
    const apex = clamp(F.socketSkew, -0.9, 0.9) * w;
    const side1 = (h, bend, x) => {
      const xn = x < apex ? (x - apex) / (apex + w) * w : (x - apex) / (w - apex) * w;
      const straight = h * (1 - Math.abs(xn) / w);
      const r = (w * w + h * h) / (2 * h);
      return straight + (Math.sqrt(Math.max(0, r * r - xn * xn)) - (r - h) - straight) * clamp(bend, 0, 1);
    };
    const lozenge = [[-w - F.socketTips, 0]];
    for (let i = 0; i <= 24; i++) {
      const x = -w + 2 * w * i / 24;
      lozenge.push([x, -side1(hTop, F.socketRound, x)]);
    }
    lozenge.push([w + F.socketTips, 0]);
    for (let i = 24; i >= 0; i--) {
      const x = -w + 2 * w * i / 24;
      lozenge.push([x, side1(hBot, F.socketRoundB, x)]);
    }
    const shape = toPath(lz.map(lozenge));
    ctx2.fill(shape);
    ctx2.save();
    ctx2.clip(shape);
    const gx = p.gazeX * w * 0.3, gy = p.gazeY * F.socketH * 0.3;
    const disc = (cx, cy, r, col) => {
      const [x, y] = m.apply([cx, cy]);
      ctx2.beginPath();
      ctx2.ellipse(x, y, r * Math.hypot(m.a, m.b), r * Math.hypot(m.c, m.d), Math.atan2(m.b, m.a), 0, Math.PI * 2);
      ctx2.fillStyle = col;
      ctx2.fill();
    };
    disc(gx, gy, R, F.maskColor);
    disc(gx, gy, R - F.ringWidth, PALETTE.ink);
    if (p.blankEyes > 0.5) disc(gx, gy, R * F.iris, PALETTE.white);
    else {
      disc(gx, gy, R * F.iris * (1 - wide * 0.1), F.irisColor);
      disc(gx, gy, R * F.glint * (1 - wide * 0.3), PALETTE.white);
    }
    ctx2.restore();
  }
  function openness(p) {
    const smile = clamp(p.mouthSmile, -1, 1);
    return Math.max(clamp(p.mouthOpen, 0, 1), p.happyEyes > 0.5 ? 0.55 : 0, smile >= 0.95 && p.squint < 0.6 ? 0.3 : 0);
  }
  function mouthShape(p) {
    const o = openness(p), smile = clamp(p.mouthSmile, -1, 1);
    if (o > 0.12) return p.mouthOpen > 0.12 && smile >= 0.85 && (p.squint >= 0.6 || p.eyeWide >= 0.7) ? "teeth" : "fang";
    if (smile >= 0.6) return "smirk";
    if (smile <= -0.3) return "frown";
    return "neutral";
  }
  function mouth(ctx2, m, p, S) {
    if (mouthShape(p) === "fang") bite(ctx2, m, p, openness(p));
    else zigOrTeeth(ctx2, m, p, S);
  }
  function bite(ctx2, m, p, o) {
    const smile = clamp(p.mouthSmile, -1, 1);
    const w = 4 + o * 3.5 + Math.max(0, smile) * 2;
    const h = 2.4 + o * 6.5;
    const lift = Math.max(0, smile) * 1.5;
    const tooth = 0.8 + o * 1;
    const shape = [
      [-w, -lift],
      [-w * 0.62, -tooth - lift * 0.5],
      [-w * 0.38, 0.2],
      [-w * 0.08, -tooth * 1.15],
      [w * 0.2, 0.3],
      [w * 0.5, -tooth - lift * 0.4],
      [w * 0.74, -0.2],
      [w, -lift - 0.5],
      [w * 0.62, h * 0.48],
      [w * 0.05, h],
      [-w * 0.3, h * 0.7],
      [-w * 0.72, h * 0.42]
    ];
    ctx2.fillStyle = PALETTE.white;
    ctx2.fill(toPath(m.map(shape)));
  }
  function zigOrTeeth(ctx2, m, p, S) {
    const open = clamp(p.mouthOpen, 0, 1), smile = clamp(p.mouthSmile, -1, 1);
    const grin = clamp((smile - 0.4) / 0.6, 0, 1);
    const frown = clamp(-smile, 0, 1);
    const smirk = open < 0.12 ? clamp((smile - 0.45) / 0.4, 0, 1) : 0;
    const w = 6.5 + grin * 7 + open * 1.5 - frown * 2;
    const n = 3 + Math.round(grin * 3 + open * 1.5);
    const lift = smile * 3;
    const depthMax = open * (3 + grin * 3.4) + (1 - grin) * open * 2;
    const zigAmp = 0.7 + open * 0.35 - frown * 0.2;
    const pts = n * 2 + 1;
    const upper = [], lower = [];
    for (let i = 0; i < pts; i++) {
      const t = i / (pts - 1), u = 2 * t - 1, x = -w + 2 * w * t;
      const base = -lift * u * u + lift * 0.35 - smirk * 2.4 * Math.max(0, u) ** 1.5;
      const zig = (i % 2 ? zigAmp : -zigAmp) * (1 - 0.5 * u * u);
      const profile = grin > 0.3 ? Math.pow(Math.max(0, 1 - u * u), 0.75) : Math.pow(Math.max(0, 1 - u * u), 0.45);
      const d = depthMax * profile;
      upper.push([x, base + zig - d * 0.35]);
      lower.push([x, base - zig * 0.6 + d * 0.65 + (grin > 0.3 ? lift * 0.25 * (1 - u * u) : 0)]);
    }
    const U = m.map(upper), Lo = m.map(lower);
    if (open > 0.05) {
      const slot = toPath([...U, ...[...Lo].reverse()]);
      ctx2.fillStyle = PALETTE.mouthInner;
      ctx2.fill(slot);
      ctx2.save();
      ctx2.clip(slot);
      ctx2.fillStyle = PALETTE.white;
      const ky = Math.hypot(m.c, m.d);
      for (const [line, other, dir] of [[U, Lo, 1], [Lo, U, -1]]) {
        for (let i = 0; i + 2 < line.length; i += 2) {
          const a = line[i], b = line[i + 2], mid = line[i + 1];
          const gap = Math.abs(other[i + 1][1] - mid[1]);
          const len = Math.min(gap * (grin > 0.3 ? 0.5 : 0.35), (1.3 + grin * 2) * ky);
          ctx2.beginPath();
          ctx2.moveTo(a[0], a[1]);
          ctx2.lineTo(b[0], b[1]);
          ctx2.lineTo(mid[0], mid[1] + dir * len);
          ctx2.closePath();
          ctx2.fill();
        }
      }
      ctx2.restore();
    }
    ctx2.strokeStyle = PALETTE.white;
    ctx2.lineWidth = (cfg.mouthLine + grin * 0.15) * S;
    ctx2.lineJoin = "miter";
    for (const line of open > 0.05 ? [U, Lo] : [U]) {
      ctx2.beginPath();
      ctx2.moveTo(line[0][0], line[0][1]);
      for (const q of line.slice(1)) ctx2.lineTo(q[0], q[1]);
      ctx2.stroke();
    }
  }

  // src/renderer/character/params.ts
  var NEUTRAL = {
    bodyX: 0,
    bodyY: 0,
    bodyRot: 0,
    breathe: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    gazeX: 0,
    gazeY: 0,
    blinkL: 0,
    blinkR: 0,
    eyeWide: 0,
    squint: 0,
    mouthOpen: 0,
    mouthSmile: 0.35,
    maskGlow: 0.2,
    armLRaise: 0,
    armRRaise: 0,
    armRWave: 0,
    hip: 0,
    hairWind: 0,
    float: 0.4,
    glitch: 0,
    sleep: 0,
    ringPulse: 0,
    armSpread: 0,
    manyEyes: 0,
    thighL: 0,
    kneeL: 0,
    foreL: 1,
    thighR: 0,
    kneeR: 0,
    foreR: 1,
    hipDrop: 0,
    lean: 0,
    hairStream: 0,
    happyEyes: 0,
    blankEyes: 0,
    clawScale: 1,
    zoom: 1,
    hairUp: 0,
    turn: 0,
    back: 0
  };

  // assets/desktop-sprites/rig.json
  var rig_default = { joints: { pelvis: [133, 194], neck: [130, 139], head: [134, 123], shoulderL: [119, 148], elbowL: [93, 167], wristL: [69, 180], handL: [34, 189], shoulderR: [142, 149], elbowR: [155, 200], wristR: [163, 233], handR: [172, 257], hipL: [124, 202], kneeL: [123, 263], ankleL: [132, 333], footL: [127, 366], hipR: [143, 202], kneeR: [148, 261], ankleR: [160, 333], footR: [167, 366] }, frameW: 240, frameH: 384, bones: [{ name: "torso", parent: null, pivot: [133, 194], end: [130, 139], z: 40, layers: { violet: [[136.8, 181, 136.8, 182, 141.8, 191.8, 141.5, 193.2, 142, 193.2, 143.2, 191.8, 143.2, 190.8, 138.2, 182.5, 137.8, 181], [140.2, 166, 139.8, 166, 133.8, 175, 133.8, 176, 136.2, 180.2, 137, 180.2, 137, 179.5, 135.2, 175.8, 140.2, 168.2], [148, 144.2, 148.8, 152.8, 149.5, 155.5, 150, 155.5, 149.5, 145, 149, 144.2]], crimson: [[114.8, 186.5, 114.8, 187, 121, 190.8, 124.2, 193.8, 133, 192.8, 135.5, 192, 135.5, 190.8, 128.8, 181, 128, 174.2, 127.5, 173.8, 126.8, 173.8, 120.8, 180, 120, 180], [129.8, 170.2, 128.8, 171.5, 130.2, 180, 131.2, 181, 137.2, 183.5, 137.5, 182.2, 137, 181.5, 137.5, 180.5, 137, 179.2, 136, 179, 131.5, 170.8, 130.8, 170], [134.5, 143, 133.2, 143, 131.2, 144.2, 130.5, 148, 129.8, 148.8, 127, 147.8, 124, 151.5, 123.5, 154.5, 122.5, 154.8, 122.8, 155.8, 126.5, 160.5, 126, 163.5, 127.8, 169.8, 129, 169.8, 134.2, 164.2, 133.8, 162, 134.5, 161, 138.5, 159.2, 136.2, 148.8, 135, 149.2, 134.2, 148.5, 134.8, 146, 133.8, 145, 134.8, 143.8], [136, 139.2, 137.2, 141.8, 138.8, 141.8, 138.8, 139.5]], ink: [[120.8, 154.8, 120, 156, 125.8, 166.8, 126.5, 171.8, 120.8, 179, 120, 180.8, 120.8, 180.8, 127, 174.2, 127.8, 174.8, 128.5, 181.5, 135.2, 191.5, 132.5, 192.5, 124.5, 193.5, 124.5, 194, 132.2, 202.8, 133.8, 203.5, 141.8, 193.5, 142, 191.2, 137.8, 182.8, 136.8, 183, 131.8, 180.8, 130.5, 179.5, 129, 172, 130.5, 170.5, 132.8, 174.5, 134, 175.5, 140.2, 165.8, 138.5, 159, 137.8, 159, 133.8, 161, 133.5, 162.5, 134, 163.8, 128.2, 169.5, 127.2, 167.5, 126.2, 163, 127, 160.2, 123, 155.2, 123, 153.5], [142, 142.5, 137.5, 141.2, 136.2, 139.2, 130.8, 139, 127.5, 141.8, 123.8, 141.2, 126, 144.8, 124.5, 147.2, 124, 151.8, 125, 151.2, 127.5, 148, 130, 149.2, 130.8, 148.5, 131.5, 144.8, 133.8, 143.2, 134.2, 143.8, 133.5, 144.5, 133.5, 145.5, 134.5, 146.5, 134, 149, 134.5, 149.5, 136, 149.2, 137, 145.8, 139.5, 143.5, 142, 143]], green: [[121.8, 141.2, 121.8, 141.8, 123, 142.5, 124, 144.8, 124.5, 147.5, 125, 147.5, 126.2, 145.8, 126, 143.8, 124, 141.2]] } }, { name: "head", parent: "torso", pivot: [130, 139], end: [134, 123], z: 60, layers: { violet: [[120.5, 132.2, 119.2, 132.5, 118.5, 134.8, 118.8, 135.8, 119.8, 135.5, 119.8, 134.5, 120.5, 133.5], [140.8, 130.8, 138.8, 130.8, 137.8, 131.5, 137, 134.2, 137.2, 135.5, 138.2, 135.5, 139, 133.2, 141, 131.5], [126, 125, 125.8, 126.5, 126.8, 126.8, 127.5, 126, 127.5, 125.2], [139.2, 121, 138.2, 121, 136.8, 122.2, 136.8, 124, 137.2, 124.8, 138.5, 125, 140, 124, 140.2, 122]], crimson: [[136.8, 135.2, 135.2, 137.8, 135.2, 138.8, 136.2, 139.8, 138.8, 139.8, 138.5, 135.2], [138, 122.2, 137.5, 123.8, 138.8, 124.2, 139.2, 122.8]], ink: [[115.8, 119.5, 114.8, 129.5, 117.8, 135.2, 119.2, 136, 119, 134.2, 120.2, 132.5, 120, 130.2, 117, 119.5], [144.8, 105.8, 143.8, 106.2, 134.8, 116.2, 134.8, 116.8, 143, 115.2, 144, 116.2, 143.8, 118, 140, 117.2, 137.8, 117.8, 135.5, 120, 136, 121.2, 135.5, 124.5, 134.5, 124.5, 133.8, 125.5, 134, 127.5, 135.5, 127.5, 139.8, 126, 141.5, 126.2, 142, 125.8, 141.5, 124.2, 142.5, 123.2, 143.8, 118.8, 144.2, 120.2, 144.2, 126, 143.2, 127, 128.5, 130.5, 125.2, 130.5, 124.8, 129, 123.5, 128.2, 124.5, 126.8, 125.2, 128.5, 127.2, 128.5, 128, 129, 129.8, 128.5, 129.8, 127.8, 128.5, 126.8, 128.2, 123.5, 127, 122.2, 129, 120.5, 129.8, 120.8, 130, 114, 129, 113.8, 127.8, 115.8, 123, 127.5, 122.5, 130.8, 128, 136, 131.5, 137.8, 128, 141.5, 126.2, 141.5, 126.2, 142, 128, 143.2, 131, 143.5, 132.8, 142.8, 133.8, 141.8, 134.5, 139.8, 136, 139.5, 135.5, 138.2, 137.5, 135.5, 138, 132, 139.2, 131, 140.5, 131, 140.5, 130, 153.8, 121, 153.5, 117.8, 151, 112, 149.2, 112.8, 148.8, 112.2, 148.8, 109], [138.8, 121.2, 140, 123, 138.2, 124.8, 137.2, 124, 137, 122.8]], green: [[139, 119, 139, 120, 140.8, 121.2, 141.5, 121, 141.5, 120, 141, 119.5], [144, 115.2, 142.5, 115, 139.8, 115.8, 135.8, 116, 134.5, 116.5, 130.2, 121.5, 129.5, 120.2, 128.5, 120.2, 126.8, 121.8, 126.5, 122.8, 128, 124, 128.2, 127.2, 129.2, 128.2, 128.8, 128.8, 127.2, 128, 125.8, 128.2, 125.2, 127.8, 125, 126.5, 124, 126.5, 123.2, 127.2, 123, 128.5, 124.5, 129.5, 124.8, 130.8, 127.5, 131, 136, 129, 137.5, 129, 139.2, 128.2, 141.8, 128, 143, 127.2, 143.8, 127.2, 144.5, 126.5, 144.5, 119.8, 144, 118.2], [142.2, 117.8, 143, 118.5, 142.2, 122.8, 141.2, 123.8, 141.2, 124.8, 141.8, 125.2, 141.2, 125.8, 139.8, 125.5, 134.5, 127.2, 134, 126.8, 134, 126, 134.8, 125, 135.2, 125, 135.8, 125.8, 136.5, 125.5, 135.8, 124, 135.8, 122.8, 136.5, 121.8, 136, 120, 139.2, 117.5]] } }, { name: "hair", parent: "head", pivot: [134, 123], end: [134, 123], z: 0, layers: { violet: [[66, 157.8, 67.2, 158, 68, 157.2, 68, 156.8, 66.5, 156.8], [172.5, 135.2, 172, 135.2, 170.2, 137, 170.2, 137.8, 171.2, 137.8, 172, 137], [159, 129, 158.2, 129, 156.8, 130.5, 156.2, 131.5, 153, 134.8, 153, 135.2, 153.5, 135.2, 159, 129.8], [99, 126.8, 97.2, 126.5, 95.5, 129, 93.5, 133, 92, 135, 80, 155.8, 79.2, 157.8, 77.2, 160.2, 77.5, 161.2, 79, 160.5, 80, 158.2, 93.8, 136.5, 95.2, 133.5, 99, 128], [182.8, 121.5, 181.8, 121.8, 180.5, 123.5, 180, 125, 179.2, 125.2, 178.2, 126.5, 178.2, 127.5, 178.8, 127.5, 179.8, 126.5, 180, 125.2, 180.8, 124.2, 181.8, 123.8, 182.8, 122.2], [152, 90.8, 151.8, 92.2, 153, 92.5, 153, 90.8], [119.5, 78.5, 118.5, 78.2, 116.2, 80.2, 116, 81.2, 117, 81.2, 119.5, 79.2], [154.8, 76.8, 153.8, 76.8, 153, 83.2, 152.5, 84.8, 152.2, 89.8, 153.2, 89.8, 154.2, 80.5, 154.8, 79.2], [124.2, 73, 123.8, 73, 120, 76.8, 120, 77.2, 120.5, 77.2, 124.2, 73.5], [170, 66.5, 169, 66.8, 166.8, 72.2, 164.2, 76.2, 164.5, 77, 165.8, 76.8, 167, 74, 167, 73, 167.8, 72.2, 169, 68.8, 170, 67.2], [131.2, 66, 130.8, 66, 129, 67.8, 129, 68.2, 129.5, 68.2, 131.2, 66.5], [136.2, 61, 135.8, 61, 133, 63.8, 133, 64.2, 133.5, 64.2, 136.2, 61.5], [143.8, 53.5, 142.2, 54, 140.5, 56.2, 140.5, 56.8, 141, 56.8, 143.5, 54.5], [150, 47.5, 148.8, 47.5, 145.2, 51.5, 145.2, 52, 145.8, 52, 150, 48], [150, 41.2, 148.8, 41.2, 148, 41.8, 147.2, 43.2, 149, 43.2, 150, 42.2], [154.8, 27, 154, 27.2, 154, 28.2, 152.8, 29.2, 152.8, 30.5, 153.5, 30.5, 154.2, 29.8, 154.2, 29, 155, 28]], hair: [[123.8, 152.8, 122.8, 153.2, 122.5, 155, 123.8, 155], [143.2, 142.8, 142.2, 145, 144.8, 145, 146.5, 147.2, 148.2, 154.8, 149.2, 155, 148.2, 144.8, 149, 144.5, 149, 144, 147.8, 143], [202.8, 131.5, 201.8, 131.5, 201, 132.5, 198.5, 140.5, 196.5, 144.8, 196.5, 147.5, 195.2, 153.2, 195.5, 154.5, 197.8, 154, 201.2, 150.2], [187.8, 20.8, 186.8, 21, 185.8, 40.5, 185, 41.5, 176.5, 40, 175.2, 39, 173.8, 36, 172.2, 36, 148, 66, 147.8, 65.5, 150, 60.8, 151, 56.5, 151, 55, 150.2, 54.8, 149.5, 55, 140, 70, 131, 71, 127, 72, 121, 86.5, 120.5, 86.2, 120.2, 80.5, 119.5, 78.5, 142.5, 55.5, 142.5, 54.5, 143.8, 54.2, 148, 50, 147.8, 49.2, 149.2, 47.8, 150.2, 47.8, 152.8, 45, 154.5, 40.5, 154, 40, 152.2, 40, 154, 38.5, 154.2, 37.5, 155, 37.5, 157.8, 34.8, 162, 29.5, 161.8, 28.5, 160, 27.5, 161, 25, 161.2, 22, 159.8, 21.5, 155.8, 26.5, 155.8, 25, 155, 24.5, 155.2, 23.8, 149, 26.5, 146, 25.8, 116.2, 21, 116, 22, 117, 22.8, 131.5, 29.2, 138.5, 36, 138.5, 36.8, 134.2, 41.8, 91.8, 58, 90.8, 59, 88.8, 73.2, 87.8, 75.8, 88.2, 55, 87.5, 54.8, 87.2, 54, 93.8, 43.5, 101.8, 28.2, 101.8, 27.5, 100.5, 27, 86.8, 44, 70, 63, 71, 68.2, 67.5, 69.5, 63.2, 70, 62.5, 70.8, 62.8, 73.8, 66.2, 87, 69.2, 87, 73, 84.8, 73.5, 85, 52.5, 104.2, 52.8, 106, 68.5, 131.5, 70.2, 131.5, 77.2, 123.5, 77.8, 124, 78.8, 130.8, 66.2, 157.2, 68.5, 156.8, 84, 138, 85, 137.5, 85.2, 135, 93.5, 115, 93.8, 120.2, 99.5, 126.8, 99.5, 127.8, 102.5, 130.5, 112, 142, 112.8, 142, 113.2, 141.5, 114.5, 133.8, 115.2, 133.5, 114.5, 131.5, 116, 120, 116.5, 119.8, 120.2, 132.8, 120, 133.8, 121.2, 134, 122, 133.2, 122, 131.8, 123, 131, 122.8, 129.8, 128.8, 114.8, 129.2, 114.2, 129.8, 114.5, 129.5, 121.5, 130.8, 121.8, 149.8, 100.5, 150.2, 101, 148.2, 111.8, 148.8, 113, 149.8, 113, 154, 111, 154.5, 111.5, 154, 115.5, 155.5, 115.8, 166.2, 111, 166.8, 111.2, 140, 129.8, 140, 130.8, 140.8, 131.5, 142, 131.5, 149, 138, 150.5, 138.2, 152.8, 136.5, 157, 132, 157, 131, 158, 131, 158.2, 129.8, 159.2, 129.5, 160.2, 127.5, 161.2, 127, 168.8, 137.5, 171, 138, 170.8, 137.2, 171.5, 136.5, 172.2, 136.8, 178.5, 128, 178.8, 131.2, 178, 136.2, 177.8, 146.2, 176.5, 163.2, 176, 164.8, 176, 166.5, 177, 166.8, 177.5, 166.2, 185.5, 143.8, 187, 142.8, 193.8, 141, 196, 140, 196.8, 139, 201, 114, 206.5, 87.8, 205.8, 87.5, 201.8, 92.8, 195.2, 115.2, 194.8, 114.2, 194.8, 106.2, 193.8, 103.8, 192.2, 104.8, 187.8, 111.2, 187.2, 110.8, 186.8, 78.8, 186, 63.5, 186.2, 55.8, 185.8, 53.2, 186.5, 52.8, 193, 58.8, 193.5, 73.5, 194.2, 73, 195, 73.2, 199, 65.2, 197, 45, 195.5, 45.2, 195, 52, 194.5, 52.8, 194, 52, 193.8, 47.2, 191.8, 36.5], [179.8, 47.5, 183.2, 50.8, 181.5, 85, 175, 97.5, 174.8, 105.8, 174, 106.2, 170.8, 103.2, 170.8, 102.5, 172.2, 101, 172.2, 98.5, 171.5, 98, 172.2, 97.8, 172.5, 87, 172, 86.2, 172.8, 86, 173, 72.5, 171.5, 72.2, 166.2, 87.5, 165.8, 87.2, 166.2, 84.2, 165.2, 83.8, 153.8, 91.5, 153, 91, 152.5, 87.8, 154, 77.2, 155.5, 76.5, 165, 77.2, 164.8, 76.2, 166.2, 73.5, 167.5, 72.8, 167.2, 71.5, 168.2, 71, 168, 69.8, 169, 69.5, 178.5, 48.5]], ink: [[114.8, 129.2, 114.2, 131, 114.5, 133.2, 115.5, 134, 116, 135.2, 118.8, 136, 116.5, 132.5, 115.2, 129.2], [94, 114.8, 92.8, 115, 91.8, 118.5, 85, 134.5, 84.8, 138.5, 77, 160, 77.2, 161.2, 78.2, 161.2, 78, 160, 79.5, 158.2, 80.2, 158.2, 79.8, 157.5, 97, 127.5, 97.8, 126.8, 98.5, 127, 98.8, 127.8, 99.8, 127.5, 99.8, 126.2, 93.8, 119.2], [150.8, 112.8, 152.2, 115.2, 153.5, 120.8, 154, 120.8, 166.8, 112, 167, 110.8, 165.8, 110.8, 155, 115.5, 154.2, 115, 154.8, 112.2, 154.2, 110.5, 151, 111.8], [150.2, 100.2, 149.2, 100.2, 144.5, 105.5, 144.5, 106.2, 148.5, 109.8, 149, 109.8, 150.5, 101.5]], green: [] } }, { name: "upperArmR", parent: "torso", pivot: [142, 149], end: [155, 200], z: 20, layers: { violet: [[155.2, 183.5, 155.2, 185, 156.5, 189.5, 157, 193, 157.8, 194.8, 157.8, 196, 158.2, 197.2, 159, 197.2, 159, 195, 157.2, 188.5, 156.8, 185, 156, 183.5], [150.2, 174, 150.2, 174.8, 150.8, 175, 152, 178.2, 152.8, 178.5, 152.8, 177.2, 152, 176.5, 152, 175.8, 151, 174.8, 151, 174], [149.8, 167, 149.8, 173.2, 150.8, 173.2, 150.8, 167], [142.8, 163.5, 141.5, 163.5, 140, 165.5, 140.2, 167.5, 140.8, 167.5, 142.8, 165], [148.8, 152.5, 149, 162.8, 149.2, 164.5, 150.2, 164.5, 150, 155.2, 149.2, 152.5]], crimson: [[143.2, 161.2, 142.8, 161.8, 142.8, 163.2, 143.5, 164.5, 143, 166, 145.2, 173.8, 145, 186.5, 145.8, 189.5, 151.8, 200.8, 159.5, 199, 159.2, 196.5, 158.2, 196.2, 155.5, 184.5, 155.8, 183, 153, 177.8, 152.2, 177.5, 152.5, 176.8, 151.5, 176, 151.8, 175.2, 150.8, 173, 150, 172.8, 150.2, 164.2], [136, 148.8, 138, 159, 138.8, 159, 139.8, 158, 137.8, 149.5, 137, 148.8], [138.8, 147.5, 138.8, 149.2, 141.2, 157.5, 142, 157.5, 144.5, 154.8, 148, 156.2, 149.2, 156, 146.8, 146.8, 145.2, 144.8, 142, 144.8]], ink: [[139, 143.2, 136.2, 146, 136, 149, 137.5, 150, 139.5, 157.2, 138.2, 158.8, 138.2, 160, 139.8, 166, 140.2, 166, 142, 163.8, 142.5, 164, 142.8, 165.5, 143.8, 165.2, 143.8, 164, 143, 162.8, 143.5, 161.8, 149.5, 164.2, 149.2, 155.8, 144, 154.5, 141.5, 157, 140.2, 153.8, 139, 148, 143.8, 143.8, 143.8, 143, 140.5, 142.8]], green: [] } }, { name: "forearmR", parent: "upperArmR", pivot: [155, 200], end: [163, 233], z: 21, layers: { violet: [[160.8, 207, 161, 209.2, 163, 215.8, 163.8, 216.8, 163.8, 218, 165, 221, 165.8, 221.2, 165, 217.2, 164, 215.5, 164, 214.5, 162, 208.8, 161.8, 207], [159.8, 202.8, 159.8, 204.8, 160, 205.2, 161, 205.2, 160.8, 203], [158.8, 198.8, 159, 200.8, 160, 200.8, 159.8, 198.8]], crimson: [[153.8, 195.2, 151, 197, 150.8, 198.8, 159.8, 216.2, 160, 221.2, 157, 232, 157.5, 235, 162, 233.5, 161.8, 232, 162.5, 230.8, 164.8, 232.2, 168.2, 231.5, 166.8, 224.2, 166, 223.5, 166, 221.2, 164, 217.5, 164.5, 216, 163.2, 215.2, 161, 207.5, 161.5, 206.5, 161, 205, 160, 204.2, 160.5, 202.2, 160, 200.5, 159.2, 200.2, 159.2, 198, 157.8, 196, 156, 195.2]], ink: [[161.8, 230.8, 161.5, 233.2, 165, 232.5, 165, 231.8, 163.5, 230.5, 162.2, 230.2]], green: [] } }, { name: "handR", parent: "forearmR", pivot: [163, 233], end: [172, 257], z: 22, layers: { violet: [[170, 241.8, 169, 242.2, 168.8, 243.5, 167.5, 245.8, 162.8, 251, 162.5, 252, 163.8, 251.8, 168, 247.8, 169, 246, 170.2, 245, 170.5, 242.2]], crimson: [[166.5, 224.2, 168, 231, 167.5, 231.2, 165.8, 229, 164, 228.2, 161.8, 228.2, 160, 229, 158.2, 231.8, 158.2, 234.5, 157.2, 232.5, 156.8, 232.5, 159.5, 244.8, 161, 245, 162, 239, 162, 235.5, 161.5, 234.2, 162, 233.8, 161.8, 232, 162.5, 230.8, 169, 236.2, 170.2, 244, 169.5, 245, 170, 245.8, 165.8, 255.5, 165.8, 257, 166.5, 257.2, 169.5, 254, 170.5, 251.2, 173, 248, 173.2, 241.8, 174.8, 244.2, 174.8, 246.2, 174, 248.5, 174.8, 249, 174, 257, 175, 257.2, 177, 252, 178.5, 245.8, 178, 244.5, 178.8, 244.2, 175, 236, 168.2, 226.8, 167, 224.2]], ink: [[173.8, 241.5, 172.8, 241.5, 172.8, 247.5, 170.2, 250.8, 169.2, 253, 169.2, 254.5, 167.8, 257.5, 168.2, 259, 169.8, 258.2, 175, 246.8, 175, 243.8], [163, 230.2, 161.8, 230.8, 161.5, 233.2, 166, 238.2, 166.5, 239.2, 166.5, 241.8, 164, 247, 160.8, 252, 161.2, 253, 163.5, 252, 163.2, 251.2, 167.8, 246.2, 169.2, 242.8, 170.2, 242.2, 169.2, 235.8]], green: [] } }, { name: "thighL", parent: "torso", pivot: [124, 202], end: [123, 263], z: 30, layers: { violet: [[118, 248, 118, 249.5, 119, 251.8, 119.8, 254.8, 120.8, 254.8, 120.8, 253.5, 120, 252.5, 120, 251, 119, 248.2], [127.8, 214, 127.5, 221.8, 127, 223.8, 127, 228.2, 126.5, 232.2, 126.5, 237, 125.8, 243.2, 125.8, 247.8, 131.8, 259.8, 132, 262.5, 134.2, 262.5, 134.2, 260.8, 127.5, 247.8, 128.2, 232, 129, 227.5, 129, 218, 129.8, 216.8, 129.8, 215.8, 129, 214.2]], crimson: [[134, 220, 133.5, 220, 132.2, 221.8, 131.5, 221.8, 131.8, 223.8, 132.5, 224.8, 134.2, 224.8], [128, 208.5, 128, 213.5, 129.5, 216.2, 129, 217.5, 130.5, 218.5, 133.5, 214.8, 133.8, 213.5, 129.2, 208.5], [112.2, 189.5, 112.2, 190, 117.8, 194.5, 124.5, 193.8, 121.5, 190.5, 115.5, 186.8, 114.5, 186.8]], ink: [[133, 224, 132.5, 224.5, 133.8, 228.2, 134.5, 228.5, 134.2, 224.5], [113.8, 212, 113.8, 213.8, 121.2, 246.2, 120.8, 252.5, 120, 254, 118.2, 249, 118.8, 247.8, 114, 236, 113.5, 236, 119.5, 263, 132.2, 262.5, 132, 259.2, 126, 247.2, 127.8, 221.2], [112, 189.8, 111.5, 191.5, 114, 194.8, 111, 199.2, 111.2, 201.5, 112, 201.8, 115, 197.5, 116.8, 196, 126.5, 206.2, 128, 208.8, 128.8, 208.8, 133.2, 213.5, 133.2, 214.2, 130.2, 217.8, 131, 221.2, 131.8, 222.2, 132.5, 222.2, 134, 220.2, 133.5, 203.2, 124.8, 193.5, 118.2, 194.2, 113.2, 189.8]], green: [[111.2, 233, 113, 246.8, 112, 247.5, 108.5, 247.8, 108.2, 249.5, 109.5, 253.2, 112, 264, 114.2, 264.2, 120, 263.5, 113.8, 235.5, 112.2, 233], [116, 195.8, 111.5, 201.5, 111.8, 204.2, 113.5, 210, 113.8, 212.2, 114.2, 213, 116.2, 214, 126, 220.8, 127.8, 221.5, 128, 214.5, 128.8, 214.2, 128.2, 213, 128.2, 208, 126.8, 205.8, 117.2, 195.8]] } }, { name: "shinL", parent: "thighL", pivot: [123, 263], end: [132, 333], z: 31, layers: { violet: [[132, 262.2, 131.2, 298, 132.5, 302.8, 132.8, 305.2, 133.5, 307, 133.8, 310, 134.5, 311.5, 134.8, 314, 135.5, 315.8, 137.8, 326, 139.5, 331, 139.8, 333.2, 140.2, 334.2, 142, 334.5, 140, 327.2, 139.2, 325.8, 139, 323, 138, 320.5, 137.8, 318.2, 136.8, 315.2, 135.8, 309.5, 133, 298.5, 134.2, 262.2]], crimson: [], ink: [[121.8, 258.2, 119, 260, 119, 261.2, 124.5, 286, 126.2, 296.2, 125.2, 295.5, 117.5, 284.2, 115.5, 277.2, 115, 277.2, 115, 284.5, 115.8, 284.8, 116.5, 288.5, 121, 324.2, 121.5, 325.8, 122, 325.8, 122.5, 307.2, 123.2, 301.2, 122.5, 300.2, 123, 300, 123.2, 297.2, 128.5, 307.8, 129.5, 314, 129, 316.8, 129.8, 317, 132.2, 331, 131.8, 333, 140.5, 334.2, 134, 309.5, 133.8, 306.5, 131.5, 297.5, 132.2, 262.2, 127.8, 262.5, 126.8, 260, 125.8, 259, 124, 258.2]], green: [[129, 316.5, 128, 320.2, 126.5, 333, 132, 333, 132.5, 332.2, 132.5, 330.5, 131, 322.8, 130.8, 319.2, 130, 316.5], [115, 284.2, 114.8, 293.2, 113.2, 295, 109, 298.2, 108.8, 300, 111, 304.5, 119.8, 326.5, 120.5, 327.5, 121.5, 327.5, 122, 326.8, 122, 325.5, 121.2, 323.8, 121, 319.8, 120.2, 316.2, 119, 304.5, 118.2, 301.5, 116.8, 288, 116, 284.2], [118.8, 260.5, 118.2, 263, 117.8, 263.5, 112.2, 264, 112.2, 265, 114.2, 272.8, 114.8, 273.5, 115, 277.5, 115.8, 279.2, 115.8, 280.2, 116.5, 281.5, 116.8, 283.8, 124.5, 294.8, 125, 296, 125.8, 296.8, 126.5, 296.8, 126.8, 295.2, 125, 288.5, 125, 286.8, 121.2, 270.2, 120.8, 266.5, 120.2, 265.5, 120, 262.8, 119.2, 260.5]] } }, { name: "footL", parent: "shinL", pivot: [132, 333], end: [127, 366], z: 32, layers: { violet: [[137, 336, 136, 336, 135.5, 336.8, 134.5, 340.2, 129.8, 352, 129.5, 353.5, 126.8, 360, 125.5, 362, 125.5, 363, 126, 363.5, 126.8, 363.5, 127.8, 362.2, 130, 357.8, 131, 354.8, 133, 351.2, 134, 346.5, 135, 344.5, 136, 340.8, 137, 339.2], [140.2, 334, 140.5, 337.5, 138.8, 345.2, 139, 347.2, 139.8, 347.2, 140.2, 346.8, 142.2, 337.5, 142, 334.2]], crimson: [], ink: [[133, 328.2, 131.8, 328.2, 132.2, 331, 131.8, 332.8, 127.2, 339.2, 126.5, 339, 127, 343.5, 125.5, 362.2, 126.5, 361.5, 128.8, 356.5, 136.5, 336.2, 137, 337, 136.5, 339.8, 137.2, 340.2, 137.2, 345.5, 139, 347, 140.8, 338, 140.8, 334.2, 136.8, 333.5, 135.8, 330]], green: [[132, 328.2, 130.8, 328.2, 129, 329, 128, 330, 127.2, 332.5, 126.5, 332.8, 126, 334.8, 126, 338.5, 126.8, 339.5, 128, 339.2, 132.5, 332.2]] } }, { name: "thighR", parent: "torso", pivot: [143, 202], end: [148, 261], z: 33, layers: { violet: [[142.8, 191.5, 141.5, 193, 140.8, 199.8, 142.5, 205.2, 143.8, 212.2, 144.5, 213.8, 145, 231.8, 145.8, 235.2, 145.8, 241.8, 146.2, 246, 146.8, 247.8, 148, 249.5, 148.8, 249.8, 148.8, 248.8, 148, 248, 147.5, 246.5, 147, 234.2, 146, 222.8, 146, 213, 142.8, 201, 142.8, 197.5, 143.2, 194.5, 143.2, 191.5]], crimson: [[134.2, 228.5, 134.2, 230, 142.5, 251, 143, 261.8, 154.5, 260.2, 149, 249.2, 148.2, 249, 148.5, 248.2, 146.8, 246.8, 145.8, 233, 137, 229], [136.2, 216.5, 133.8, 219.5, 134, 224.8, 143.2, 229, 145, 229.2, 145, 224.2, 137.5, 216.8]], ink: [[134, 224.5, 134.2, 228.8, 145.5, 233, 145.2, 228.8, 143.8, 228.8], [141.2, 193.2, 133.2, 203.2, 133.8, 219.8, 137, 217, 145, 224.5, 144.8, 213.2, 141, 199.2, 141.8, 193.2]], green: [] } }, { name: "shinR", parent: "thighR", pivot: [148, 261], end: [160, 333], z: 34, layers: { violet: [[178, 285.5, 177.2, 285.5, 176.8, 286.2, 174.8, 292.2, 174.8, 293.2, 172.8, 298.2, 172.8, 299.2, 168.8, 311.2, 168.8, 312.5, 168, 313.8, 166.8, 317.5, 166.8, 318.5, 165.8, 320.5, 165.8, 321.8, 163.8, 327.8, 163.5, 329.8, 162.5, 331.2, 162.8, 332.5, 164, 332.2, 167.2, 320, 168.8, 316.2, 169.2, 313.5, 171, 308.8, 171, 307.8, 171.8, 306.5, 173, 301.5, 174.8, 297.2, 175, 295.2, 178, 286.8], [182, 272.8, 181, 272.8, 180.8, 274.5, 179.8, 276.5, 179.5, 278.5, 177.8, 282.8, 177.5, 285, 178.2, 285, 178.8, 284.2, 180, 279.2, 180.8, 278, 181, 276, 182, 273.8], [183, 268.8, 182, 269, 181.8, 271, 182.8, 271], [157.2, 267, 157.2, 307.2, 157.8, 309.2, 157.8, 312, 158, 312.8, 159, 312.8, 159, 308.5, 158.2, 305.5, 158.5, 267.5, 158.2, 267], [154, 260, 154, 261, 154.8, 261.8, 155, 263.2, 156, 264.8, 156.8, 264.8, 156.8, 264, 155.8, 262, 155, 261.5, 154.8, 260.2]], crimson: [[185.8, 257.8, 184.8, 258, 183.2, 260, 172, 281.8, 170, 283.5, 163, 287, 162.2, 288, 160.8, 303, 160.2, 314.2, 159.5, 314.8, 159.5, 321.2, 159, 321, 155.2, 309.2, 156.2, 288.2, 157.2, 284.5, 157.5, 267.5, 158, 266.5, 156.2, 263, 155.2, 262.8, 155.5, 261.5, 154.8, 260, 152.8, 260, 150.8, 257, 149, 256.2, 146.8, 256.2, 145, 257, 143.5, 259, 143, 262.2, 144.5, 278.2, 145.5, 278.8, 153.5, 308.2, 153.5, 312, 152.8, 312.2, 153.8, 317.5, 153.8, 325.2, 154.5, 334, 163, 332.5, 162.8, 331.8, 163.8, 330.2, 166, 321, 169, 313, 173, 298.8, 177, 286.8, 178.2, 285.5, 178, 283.2, 179.2, 279.8, 180.2, 279.2, 179.8, 278.5, 180, 277, 181.5, 275.2, 181, 274, 182.2, 272.5, 182.2, 269.5, 183.2, 269, 184.8, 264.2, 184.8, 263.5, 184, 263.2, 185, 263, 185, 261.8, 186.2, 259]], ink: [[156.8, 284.2, 156, 287.8, 155, 309.8, 158.8, 321.5, 159.8, 321.8, 160, 316.2, 159.2, 316, 159.8, 314.8, 159, 312.5, 158.5, 312.5, 158, 311.5, 157.5, 306.8, 157.2, 284.2], [144.8, 277.8, 145, 284.2, 152.8, 312.5, 153.8, 312.5, 153.8, 307.8, 145.8, 278.2]], green: [] } }, { name: "footR", parent: "shinR", pivot: [160, 333], end: [167, 366], z: 35, layers: { violet: [[163.8, 330, 163.2, 330, 162.5, 331.2, 162.8, 333.2, 163.8, 333.2, 164, 332.5]], crimson: [[158.8, 328.2, 156, 330, 155.2, 331.8, 155.2, 333.5, 154.5, 333.8, 154.8, 343.2, 160.5, 351.8, 167, 363, 168.2, 363.2, 168, 355.2, 167, 348, 166.2, 347.8, 166.8, 346, 166, 345.8, 166.5, 345, 166.2, 341.5, 163.8, 333, 163, 332.8, 162.8, 331.8, 163.5, 330.8, 163.5, 329.8, 161, 328.2]], ink: [], green: [] } }, { name: "upperArmL", parent: "torso", pivot: [119, 148], end: [93, 167], z: 70, layers: { violet: [[119.8, 154.5, 118.5, 154.2, 101.5, 163.5, 94.8, 170, 95, 171.5, 95.8, 171.8, 103.2, 164, 119.2, 155.8, 119.8, 155.2]], crimson: [], ink: [[121.8, 141.2, 120.2, 141.8, 116, 146.8, 109, 153.5, 102, 158.2, 91, 163.8, 94.5, 170.5, 102.8, 163.2, 119, 154.5, 119.5, 155.8, 120.5, 155.8, 124, 152.8, 124.8, 150, 124.8, 147.5, 123.8, 148, 119.2, 153.8, 114, 150, 121, 142.8]], green: [[122, 141.2, 121.5, 141.2, 113.8, 149.2, 113.8, 150.5, 117.8, 153, 118.8, 154, 118.8, 154.5, 119.5, 154.5, 124.8, 147.8, 124.5, 145.2, 123.2, 142]] } }, { name: "forearmL", parent: "upperArmL", pivot: [93, 167], end: [69, 180], z: 71, layers: { violet: [[97.2, 168, 96.8, 168, 94, 170.8, 92.8, 171.5, 91.2, 171.8, 87.2, 173.5, 85.5, 173.8, 83.5, 174.8, 82.5, 174.8, 80.5, 175.8, 79.5, 175.8, 75.2, 177.8, 74.2, 177.8, 72.2, 178.8, 70, 179.2, 69, 180.2, 69.2, 182.5, 70, 182.5, 70.5, 181, 71.8, 180, 95, 172.5, 95.5, 172, 95.2, 171, 96.8, 169.8]], crimson: [], ink: [[96.8, 164, 94.8, 162.5, 93.2, 162.5, 68, 177.8, 68.8, 180.5, 80, 176, 93.8, 171.5, 97.5, 168, 97.5, 165.8]], green: [] } }, { name: "handL", parent: "forearmL", pivot: [69, 180], end: [34, 189], z: 72, layers: { violet: [[51.8, 191.2, 50.5, 191.2, 49.5, 192.2, 47.8, 192.8, 41.5, 196.8, 40.2, 198, 40.2, 198.5, 42.5, 197.8, 46, 195.2, 48.8, 194, 50, 192.8, 51, 192.8, 51.8, 192], [57.8, 190, 56.5, 190, 51, 196, 47.2, 203.5, 48, 203.5, 49, 202.8, 52.2, 197, 56, 192.5, 57.8, 191], [47.5, 188, 46, 188, 42.8, 189, 42.5, 190, 47.5, 189], [73.2, 178.5, 70.5, 179, 68.8, 180.5, 68.8, 181.2, 65.8, 187.5, 65.8, 190.2, 66.5, 192.2, 66.8, 195.2, 67.8, 198.2, 68, 200.8, 69, 200.8, 68.2, 193.8, 67, 188.8, 69, 185, 69, 184.2, 70.5, 181, 71.8, 180, 73.2, 179.8]], crimson: [], ink: [[72.8, 177, 71.8, 176, 70.8, 176, 58, 183.5, 48, 185, 34.8, 188, 34.5, 189.2, 35, 189.8, 42.8, 190.2, 43.2, 189.2, 46.5, 188.2, 48, 189.5, 33.8, 199, 33.8, 199.8, 35.5, 200, 40.2, 199, 41.5, 198.2, 42, 197, 47.8, 193.2, 50.2, 193, 41.5, 206, 41.5, 206.8, 42.8, 207.2, 48.8, 203, 48.2, 202.2, 51.2, 196.5, 57.2, 190.2, 57.5, 191, 61.5, 191, 62.5, 191.8, 63.2, 197, 67, 201.8, 68.8, 202.8, 69.2, 201.5, 69, 200.5, 68.2, 200.2, 66, 188, 69, 181, 70.5, 179.5, 73.2, 178.8]], green: [] } }] };

  // assets/desktop-sprites/faces.json
  var faces_default = {
    idle: {
      frameW: 240,
      frameH: 384,
      faces: [
        {
          x: 133.9,
          y: 123.3,
          angle: -32.4,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.3,
          angle: -31,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.3,
          angle: -31,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.4,
          angle: -31.4,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.4,
          angle: -31.4,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.3,
          angle: -33.6,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.2,
          angle: -35.3,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.2,
          angle: -35.3,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.3,
          angle: -33,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.4,
          angle: -36.2,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.3,
          angle: -36.9,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.4,
          angle: -34.6,
          dist: 12.5
        },
        {
          x: 133.7,
          y: 123.4,
          angle: -34.8,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.3,
          angle: -34.3,
          dist: 12.5
        },
        {
          x: 134.1,
          y: 123.2,
          angle: -33.7,
          dist: 12.5
        },
        {
          x: 134,
          y: 123.4,
          angle: -32,
          dist: 12.5
        }
      ]
    },
    glitch: {
      frameW: 240,
      frameH: 384,
      faces: [
        {
          x: 123.7,
          y: 123.4,
          angle: -20.3,
          dist: 12.9
        },
        null,
        {
          x: 134.2,
          y: 122.8,
          angle: -33.7,
          dist: 10.4
        },
        null,
        {
          x: 133.8,
          y: 123.2,
          angle: -35.3,
          dist: 12.5
        },
        null,
        {
          x: 134.3,
          y: 123.2,
          angle: -28.7,
          dist: 14.8
        },
        {
          x: 133.8,
          y: 123.2,
          angle: -35.3,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.2,
          angle: -35.3,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.2,
          angle: -35.3,
          dist: 12.5
        }
      ]
    },
    grin: {
      frameW: 240,
      frameH: 384,
      faces: [
        {
          x: 133.9,
          y: 123.4,
          angle: -33.3,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.4,
          angle: -32.7,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.4,
          angle: -32.7,
          dist: 12.5
        },
        {
          x: 134,
          y: 123.3,
          angle: -32.1,
          dist: 12.2
        },
        {
          x: 134,
          y: 123.3,
          angle: -32.1,
          dist: 12.2
        },
        {
          x: 133.9,
          y: 123.2,
          angle: -35.1,
          dist: 12.2
        },
        {
          x: 133.8,
          y: 123.5,
          angle: -33.3,
          dist: 12.2
        },
        {
          x: 133.8,
          y: 123.4,
          angle: -33.8,
          dist: 12.2
        },
        {
          x: 133.7,
          y: 123.4,
          angle: -35.9,
          dist: 12.2
        },
        {
          x: 133.7,
          y: 123.5,
          angle: -34.4,
          dist: 12.2
        },
        {
          x: 133.8,
          y: 123.5,
          angle: -35.9,
          dist: 12.2
        },
        {
          x: 133.5,
          y: 123.6,
          angle: -34.7,
          dist: 12.5
        },
        {
          x: 133.7,
          y: 123.5,
          angle: -34.3,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.4,
          angle: -32.7,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 123.5,
          angle: -32.9,
          dist: 12.5
        },
        {
          x: 134,
          y: 123.4,
          angle: -30.6,
          dist: 12.4
        }
      ]
    },
    dance: {
      frameW: 240,
      frameH: 384,
      faces: [
        {
          x: 133.9,
          y: 128.3,
          angle: -33.1,
          dist: 12.5
        },
        {
          x: 130.9,
          y: 127,
          angle: -39.7,
          dist: 12
        },
        {
          x: 128.2,
          y: 125.5,
          angle: -42.6,
          dist: 12.4
        },
        {
          x: 126.8,
          y: 123.7,
          angle: -47.1,
          dist: 12.1
        },
        {
          x: 126.3,
          y: 123.1,
          angle: -39.2,
          dist: 12
        },
        {
          x: 127,
          y: 123.6,
          angle: -47.3,
          dist: 11.7
        },
        {
          x: 128.7,
          y: 125.6,
          angle: -41.8,
          dist: 12.4
        },
        {
          x: 130.9,
          y: 127.2,
          angle: -41.3,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 128.2,
          angle: -39.7,
          dist: 13
        },
        {
          x: 136.9,
          y: 127.8,
          angle: -34.5,
          dist: 12.7
        },
        {
          x: 139.7,
          y: 127,
          angle: -27.2,
          dist: 12.5
        },
        {
          x: 140.6,
          y: 126,
          angle: -26.2,
          dist: 12.5
        },
        {
          x: 142,
          y: 124.7,
          angle: -28.9,
          dist: 12.6
        },
        {
          x: 140.5,
          y: 126.1,
          angle: -21.9,
          dist: 12.5
        },
        {
          x: 139,
          y: 126.6,
          angle: -29.6,
          dist: 12.3
        },
        {
          x: 137.1,
          y: 127.8,
          angle: -23.1,
          dist: 11.9
        }
      ]
    },
    dangle: {
      frameW: 240,
      frameH: 384,
      faces: [
        {
          x: 132.1,
          y: 121.8,
          angle: -34.7,
          dist: 12.5
        },
        {
          x: 130.9,
          y: 120.5,
          angle: -36.6,
          dist: 12.5
        },
        {
          x: 133.8,
          y: 122.2,
          angle: -29.1,
          dist: 11.6
        },
        {
          x: 137.8,
          y: 125.1,
          angle: -34.2,
          dist: 12.4
        },
        {
          x: 138.8,
          y: 126.7,
          angle: -35.4,
          dist: 12.1
        },
        {
          x: 135.9,
          y: 125.3,
          angle: -40.1,
          dist: 12.5
        },
        {
          x: 131.7,
          y: 121.9,
          angle: -34.3,
          dist: 12.2
        },
        {
          x: 128.3,
          y: 121.7,
          angle: -17.4,
          dist: 13.2
        },
        {
          x: 131.8,
          y: 121,
          angle: -28.3,
          dist: 12.6
        },
        {
          x: 135.3,
          y: 123.6,
          angle: -34.1,
          dist: 12.5
        },
        {
          x: 136.6,
          y: 125.5,
          angle: -29.1,
          dist: 11.9
        },
        {
          x: 135,
          y: 124.6,
          angle: -32,
          dist: 12.5
        },
        {
          x: 132.1,
          y: 121.8,
          angle: -34.7,
          dist: 12.5
        },
        {
          x: 130.9,
          y: 120.5,
          angle: -36.6,
          dist: 12.5
        },
        {
          x: 133.4,
          y: 122.8,
          angle: -40.4,
          dist: 11.8
        },
        {
          x: 137.8,
          y: 125.1,
          angle: -34.2,
          dist: 12.4
        },
        {
          x: 138.8,
          y: 126.7,
          angle: -35.4,
          dist: 12.1
        },
        {
          x: 135.9,
          y: 125.3,
          angle: -40.1,
          dist: 12.5
        },
        {
          x: 131.7,
          y: 121.9,
          angle: -34.3,
          dist: 12.2
        },
        {
          x: 128.6,
          y: 120.8,
          angle: -38.5,
          dist: 11.8
        },
        {
          x: 131.8,
          y: 121,
          angle: -28.3,
          dist: 12.6
        },
        {
          x: 135.3,
          y: 123.6,
          angle: -34.1,
          dist: 12.5
        },
        {
          x: 136.6,
          y: 125.5,
          angle: -29.1,
          dist: 11.9
        },
        {
          x: 135,
          y: 124.6,
          angle: -32,
          dist: 12.5
        }
      ]
    },
    sleep: {
      frameW: 240,
      frameH: 384,
      faces: [
        {
          x: 120.8,
          y: 133.7,
          angle: -27.3,
          dist: 12.1
        },
        {
          x: 120.9,
          y: 132.6,
          angle: -27.7,
          dist: 12.4
        },
        {
          x: 120.8,
          y: 131.7,
          angle: -26.8,
          dist: 12.3
        },
        {
          x: 121.2,
          y: 130.9,
          angle: -23.6,
          dist: 11.4
        },
        {
          x: 121.1,
          y: 130.7,
          angle: -27,
          dist: 11.8
        },
        {
          x: 121.2,
          y: 130.9,
          angle: -23.6,
          dist: 11.5
        },
        null,
        null,
        {
          x: 121,
          y: 133.6,
          angle: -27.8,
          dist: 11.9
        },
        {
          x: 121,
          y: 134.6,
          angle: -27.9,
          dist: 11.9
        },
        {
          x: 121,
          y: 135.7,
          angle: -27.5,
          dist: 12.4
        },
        {
          x: 120.8,
          y: 136.5,
          angle: -28.4,
          dist: 12.4
        },
        {
          x: 120.9,
          y: 136.6,
          angle: -28,
          dist: 12.4
        },
        {
          x: 121,
          y: 135.8,
          angle: -25.2,
          dist: 11.5
        },
        {
          x: 120.9,
          y: 135.7,
          angle: -26.3,
          dist: 12.3
        },
        {
          x: 120.8,
          y: 134.7,
          angle: -26.3,
          dist: 12
        }
      ]
    },
    wake: {
      frameW: 240,
      frameH: 384,
      faces: [
        null,
        null,
        null,
        {
          x: 152.2,
          y: 124.8,
          angle: 5.4,
          dist: 16.9
        },
        null,
        {
          x: 133.7,
          y: 123.6,
          angle: -33.7,
          dist: 12.5
        },
        {
          x: 133.7,
          y: 123.6,
          angle: -33.7,
          dist: 12.5
        },
        null,
        {
          x: 133.7,
          y: 123.6,
          angle: -33.7,
          dist: 12.5
        },
        {
          x: 134.6,
          y: 123.5,
          angle: -38.5,
          dist: 12.5
        },
        {
          x: 132.9,
          y: 125.6,
          angle: -5.7,
          dist: 10.3
        },
        {
          x: 133.4,
          y: 123.2,
          angle: -33.2,
          dist: 13.4
        },
        {
          x: 133.8,
          y: 123.2,
          angle: -35.3,
          dist: 12.5
        }
      ]
    },
    walk: {
      frameW: 240,
      frameH: 384,
      faces: [
        {
          x: 133.8,
          y: 123.3,
          angle: -31.5,
          dist: 12.5
        },
        {
          x: 134.4,
          y: 122.5,
          angle: -37.3,
          dist: 12.2
        },
        {
          x: 137.2,
          y: 121.2,
          angle: -29.8,
          dist: 12.1
        },
        {
          x: 136.9,
          y: 121.2,
          angle: -32.1,
          dist: 12.2
        },
        {
          x: 137.3,
          y: 121.2,
          angle: -29.9,
          dist: 12.1
        },
        {
          x: 135,
          y: 122.2,
          angle: -37.7,
          dist: 11.8
        },
        {
          x: 133.7,
          y: 123.3,
          angle: -36.6,
          dist: 12.5
        },
        {
          x: 132.8,
          y: 122.2,
          angle: -30.1,
          dist: 12.2
        },
        {
          x: 131.8,
          y: 121.3,
          angle: -29.3,
          dist: 12.4
        },
        {
          x: 130.9,
          y: 120.8,
          angle: -42.1,
          dist: 12.1
        },
        {
          x: 131.1,
          y: 121.2,
          angle: -35.9,
          dist: 12.4
        },
        {
          x: 131.9,
          y: 122,
          angle: -38.5,
          dist: 12.1
        }
      ]
    },
    arrive: {
      frameW: 240,
      frameH: 384,
      faces: [
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        {
          x: 136.2,
          y: 123.1,
          angle: -6.7,
          dist: 14.1
        },
        {
          x: 169,
          y: 108.5,
          angle: 0,
          dist: 16.5
        },
        {
          x: 133.9,
          y: 123.3,
          angle: -33.6,
          dist: 12.5
        },
        null,
        {
          x: 133.8,
          y: 123.5,
          angle: -32.4,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.3,
          angle: -33.6,
          dist: 12.5
        },
        {
          x: 133.9,
          y: 123.3,
          angle: -33.6,
          dist: 12.5
        }
      ]
    },
    leave: {
      frameW: 240,
      frameH: 384,
      faces: [
        null,
        {
          x: 162.4,
          y: 27.3,
          angle: 6.6,
          dist: 15.7
        },
        {
          x: 135.7,
          y: 21.8,
          angle: 9.3,
          dist: 10.6
        },
        null,
        {
          x: 157.2,
          y: 27.3,
          angle: 9.3,
          dist: 12.8
        },
        null,
        null,
        null,
        null,
        null,
        null,
        null
      ]
    },
    perch: {
      frameW: 384,
      frameH: 384,
      faces: [
        {
          x: 202.9,
          y: 190.2,
          angle: -34.2,
          dist: 11.3
        },
        {
          x: 202.9,
          y: 190.3,
          angle: -34.4,
          dist: 11.3
        },
        {
          x: 203,
          y: 190.3,
          angle: -33.9,
          dist: 11.3
        },
        {
          x: 203.2,
          y: 190.2,
          angle: -33.6,
          dist: 11.6
        },
        {
          x: 203.1,
          y: 190.4,
          angle: -32.7,
          dist: 11.6
        },
        {
          x: 203.1,
          y: 190.4,
          angle: -32.7,
          dist: 11.6
        },
        {
          x: 203.2,
          y: 190.5,
          angle: -33.5,
          dist: 11.6
        },
        {
          x: 203.7,
          y: 190.4,
          angle: -36,
          dist: 11.6
        },
        {
          x: 203.7,
          y: 190.4,
          angle: -36,
          dist: 11.6
        },
        {
          x: 203.4,
          y: 190.4,
          angle: -35.4,
          dist: 11.6
        },
        {
          x: 203.4,
          y: 190.4,
          angle: -35.4,
          dist: 11.6
        },
        {
          x: 203.5,
          y: 190.4,
          angle: -34.8,
          dist: 11.6
        },
        {
          x: 203.5,
          y: 190.4,
          angle: -34.8,
          dist: 11.6
        },
        {
          x: 203.5,
          y: 190.4,
          angle: -34.8,
          dist: 11.6
        },
        {
          x: 203,
          y: 190.6,
          angle: -32.6,
          dist: 11.6
        },
        {
          x: 203,
          y: 190.6,
          angle: -32,
          dist: 11.3
        }
      ]
    }
  };

  // src/renderer/character/rig.ts
  var RIG = rig_default;
  var BONE_NAMES = RIG.bones.map((b) => b.name);
  var LAYER_ORDER = ["violet", "hair", "crimson", "ink", "green"];
  var OUTLINED = /* @__PURE__ */ new Set(["upperArmR", "forearmR", "handR"]);
  var deg = (r) => r * 180 / Math.PI;
  var Rig = class {
    frameW = RIG.frameW;
    frameH = RIG.frameH;
    paths = /* @__PURE__ */ new Map();
    world = /* @__PURE__ */ new Map();
    bonePaths(b) {
      let m = this.paths.get(b.name);
      if (!m) {
        m = /* @__PURE__ */ new Map();
        for (const [cls, list] of Object.entries(b.layers)) {
          const path = new Path2D();
          for (const flat of list) {
            path.moveTo(flat[0], flat[1]);
            for (let i = 2; i < flat.length; i += 2) path.lineTo(flat[i], flat[i + 1]);
            path.closePath();
          }
          m.set(cls, path);
        }
        this.paths.set(b.name, m);
      }
      return m;
    }
    /** The bone's world matrix (sprite px), parents first: rotate (and stretch) around its pivot. */
    solve(pose, stretch, headScale = 1) {
      this.world.clear();
      for (const b of RIG.bones) {
        const parent = b.parent ? this.world.get(b.parent) : new Mat();
        const [px, py] = b.pivot;
        let local = new Mat().translate(px, py).rotate((pose[b.name] ?? 0) * Math.PI / 180);
        if (b.name === "head" && headScale !== 1) local = local.scale(headScale);
        const k = stretch[b.name];
        if (k !== void 0 && k !== 1) {
          const dx = b.end[0] - px, dy = b.end[1] - py, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
          local = local.mul(new Mat(1 + (k - 1) * ux * ux, (k - 1) * ux * uy, (k - 1) * ux * uy, 1 + (k - 1) * uy * uy, 0, 0));
        }
        this.world.set(b.name, parent.mul(local.translate(-px, -py)));
      }
    }
    /** Draw every piece in depth order; ctx must already map sprite px to the screen. */
    draw(ctx2, pose, stretch, colour, paintHair, outlineArm = false, headScale = 1) {
      this.solve(pose, stretch, headScale);
      for (const b of [...RIG.bones].sort((a, c) => a.z - c.z)) {
        const m = this.world.get(b.name);
        ctx2.save();
        ctx2.transform(m.a, m.b, m.c, m.d, m.e, m.f);
        const paths = this.bonePaths(b);
        for (const cls of LAYER_ORDER) {
          const path = paths.get(cls);
          if (!path) continue;
          if (cls === "hair") {
            paintHair(path);
            continue;
          }
          ctx2.fillStyle = colour[cls];
          ctx2.fill(path, "evenodd");
          if (outlineArm && cls === "crimson" && OUTLINED.has(b.name)) {
            ctx2.strokeStyle = colour.ink;
            ctx2.lineWidth = 0.9;
            ctx2.lineJoin = "round";
            ctx2.stroke(path);
          }
        }
        ctx2.restore();
      }
    }
    /** Lowest point of her body (sprite px) in this pose: feet, knees, bottom, hands or head, whichever touches down. */
    lowest(pose, headScale = 1) {
      this.solve(pose, {}, headScale);
      let low = -Infinity;
      for (const b of RIG.bones) {
        if (b.name === "hair") continue;
        const m = this.world.get(b.name);
        for (const pt of [b.pivot, b.end]) low = Math.max(low, m.apply(pt)[1]);
      }
      return low;
    }
    /** Repaint only the hair (to fall in front of the face). */
    drawHair(ctx2, paintHair) {
      const b = RIG.bones.find((x) => x.name === "hair");
      const m = this.world.get("hair");
      const path = this.bonePaths(b).get("hair");
      if (!m || !path) return;
      ctx2.save();
      ctx2.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      paintHair(path);
      ctx2.restore();
    }
    /** Where a point of the reference drawing ended up, and how much its bone turned (radians). */
    place(bone, x, y) {
      const m = this.world.get(bone) ?? new Mat();
      const [X, Y] = m.apply([x, y]);
      return { x: X, y: Y, angle: Math.atan2(m.b, m.a) };
    }
  };
  var flakeCache = /* @__PURE__ */ new WeakMap();
  function flakePattern(ctx2) {
    if (flakeCache.has(ctx2)) return flakeCache.get(ctx2);
    const N = 96, cv = document.createElement("canvas");
    cv.width = N * 4;
    cv.height = N * 4;
    const g = cv.getContext("2d"), r = prng(9001);
    g.scale(4, 4);
    g.fillStyle = PALETTE.white;
    for (let i = 0; i < 650; i++) {
      const x = r() * N, y = r() * N, s = 0.15 + r() ** 5 * 1;
      g.globalAlpha = 0.7 + r() * 0.3;
      g.beginPath();
      for (let k = 0, n = 5 + Math.floor(r() * 3); k < n; k++) {
        const a = k / n * Math.PI * 2, rr = s * (0.55 + r() * 0.6);
        if (k) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
    const pat = ctx2.createPattern(cv, "repeat");
    pat?.setTransform(new DOMMatrix().scale(0.25));
    flakeCache.set(ctx2, pat);
    return pat;
  }
  function hairPainter(ctx2, colour, t, w, h) {
    return (path) => {
      ctx2.fillStyle = colour;
      ctx2.fill(path, "evenodd");
      const pat = flakePattern(ctx2);
      if (!pat) return;
      ctx2.save();
      ctx2.clip(path, "evenodd");
      ctx2.fillStyle = pat;
      ctx2.globalAlpha = 0.85 + 0.15 * Math.sin(t * 1.3);
      ctx2.fillRect(-w, -h, 3 * w, 3 * h);
      ctx2.restore();
    };
  }
  var HEAD_ANCHOR = faces_default.idle.faces[0];
  var POSE_KEY = (bone) => `p_${bone}`;
  function drawRigged(ctx2, rig2, base0, flip, p, t, F) {
    const basePose = {};
    for (const name of BONE_NAMES) basePose[name] = F[POSE_KEY(name)] ?? 0;
    const { pose, stretch } = poseFromParams(p, t, basePose);
    const low = rig2.lowest(pose, F.headScale ?? 1);
    const onEdge = Math.max(0, Math.min(1, (p.hipDrop - 110) / 40));
    const seat = low + (rig2.place("thighL", HIP[0], HIP[1]).y + SEAT_DEPTH - low) * onEdge;
    const drop = restLow(rig2, basePose, F.headScale ?? 1) - seat;
    const base = base0.translate(0, drop);
    const colour = { violet: PALETTE.violet, crimson: F.hairColor, ink: PALETTE.ink, green: F.maskColor };
    ctx2.save();
    ctx2.transform(base.a, base.b, base.c, base.d, base.e, base.f);
    const paint = hairPainter(ctx2, F.hairColor, t, rig2.frameW, rig2.frameH);
    rig2.draw(ctx2, pose, stretch, colour, paint, p.armRRaise > 0.35 || p.armSpread > 0.4, F.headScale ?? 1);
    ctx2.restore();
    const a = HEAD_ANCHOR;
    const at = rig2.place("head", a.x, a.y);
    const [hx, hy] = base.apply([at.x, at.y]);
    const k = Math.hypot(base.a, base.b);
    const s = a.dist * k * F.faceScale * (F.headScale ?? 1) / (2 * F.eyeSpacing);
    const angle = (a.angle + F.faceAngle) * Math.PI / 180 * flip + at.angle * flip;
    const head = new Mat().translate(hx + F.faceX * s * flip, hy + F.faceY * s).rotate(angle).scale(s * flip, s).translate(0, -F.eyeY);
    const fp = { ...p, headYaw: 0, turn: 0 };
    drawFace(ctx2, head, fp, s, void 0, false, "without");
    if (F.hairFront >= 0.5) {
      ctx2.save();
      ctx2.beginPath();
      ctx2.arc(hx, hy, s * (F.bandWidth + 12), 0, Math.PI * 2);
      ctx2.clip();
      clipOutFace(ctx2, head, F);
      ctx2.transform(base.a, base.b, base.c, base.d, base.e, base.f);
      rig2.drawHair(ctx2, hairPainter(ctx2, F.hairColor, t, rig2.frameW, rig2.frameH));
      ctx2.restore();
    }
    drawFace(ctx2, head, fp, s, void 0, false, "only");
  }
  var ARM_L_REST = -30;
  var FOOT_REST = { L: 50, R: -50 };
  function poseFromParams(p, t, base) {
    const pose = { ...base };
    const add = (k, v) => {
      pose[k] = (pose[k] ?? 0) + v;
    };
    add("torso", deg(p.bodyRot) * 0.8 + deg(p.lean) * 0.7 + Math.sin(t * 1.6) * 0.6 * p.breathe);
    add("head", deg(p.headRoll) * 0.9 + p.headPitch * 8);
    add("hair", Math.sin(t * 1.15) * (1.2 + p.hairWind * 3) - p.hairStream * 12);
    add("upperArmL", ARM_L_REST + p.armLRaise * 125 + p.armSpread * 60 + Math.sin(t * 0.9) * 1.5);
    add("forearmL", p.armLRaise * 35 - p.armSpread * 10);
    add("handL", p.armLRaise * 10);
    add("upperArmR", -p.armRRaise * 140 - p.armSpread * 70 + Math.sin(t * 0.8 + 1) * 1.5);
    add("forearmR", -p.armRRaise * 25 + p.armRWave * 32 + p.armSpread * 10);
    add("handR", p.armRWave * 12);
    const leg = (side, thigh, knee) => {
      const sign = side === "L" ? 1 : -1;
      add(`thigh${side}`, sign * thigh * LEG_SWING);
      add(`shin${side}`, -sign * knee * KNEE_FOLD);
    };
    add("footL", FOOT_REST.L);
    add("footR", FOOT_REST.R);
    leg("L", p.thighL, p.kneeL);
    leg("R", p.thighR, p.kneeR);
    return { pose, stretch: {}, drop: 0 };
  }
  var LEG_SWING = 0.62;
  var KNEE_FOLD = 0.95;
  var HIP = [124, 202];
  var SEAT_DEPTH = 12;
  var restCache = { key: "", low: 0 };
  function restLow(rig2, basePose, headScale) {
    const key = JSON.stringify(basePose) + headScale;
    if (restCache.key !== key) {
      const stand = { ...basePose };
      stand.footL = (stand.footL ?? 0) + FOOT_REST.L;
      stand.footR = (stand.footR ?? 0) + FOOT_REST.R;
      restCache = { key, low: rig2.lowest(stand, headScale) };
    }
    return restCache.low;
  }

  // src/editor/main.ts
  var GROUPS = [
    ["Visage trac\xE9", [
      ["faceTraced", "Visage trac\xE9 1:1 (1) / r\xE9glable (0)", 0, 1, 1],
      ["eyeMirror", "\u0152il gauche = miroir du droit (0 / 1)", 0, 1, 1],
      ["eyeGap", "\xC9cart des yeux", -4, 10, 0.25],
      ["eyeTurn", "Rotation des yeux", -40, 40, 1],
      ["eyeShiftY", "Hauteur des yeux", -10, 10, 0.25],
      ["lashScale", "Cils du bas : longueur", 0.5, 3, 0.05],
      ["lashTopScale", "Cil du haut : longueur", 0.5, 4, 0.05],
      ["crossLashAngle", "Barre du cil : angle", -60, 60, 1]
    ]],
    ["Bandeau vert", [
      ["bandTilt", "Inclinaison", -35, 35, 1],
      ["bandWidth", "Largeur", 12, 30, 0.5],
      ["bandHeight", "\xC9paisseur", 6, 26, 0.5],
      ["bandY", "Hauteur", -15, 5, 0.5],
      ["bandSlant", "Biseau des bords", -8, 8, 0.5],
      ["bandTopExtra", "Haut plus large que le bas", -6, 10, 0.5],
      ["bandCurve", "C\xF4t\xE9s arrondis", -4, 8, 0.25]
    ]],
    ["Yeux", [
      ["eyeSpacing", "\xC9cart", 8, 17, 0.5],
      ["eyeY", "Hauteur", -14, 4, 0.5],
      ["socketW", "Losange noir : longueur", 5, 15, 0.5],
      ["socketH", "Losange noir : hauteur", 3, 12, 0.5],
      ["socketTurn", "Losange noir : rotation", -60, 60, 1],
      ["socketRound", "Losange noir : courbure du haut", 0, 1, 0.05],
      ["socketRoundB", "Losange noir : courbure du bas", 0, 1, 0.05],
      ["socketHB", "Losange noir : hauteur du bas (\xD7)", 0.3, 1.6, 0.05],
      ["socketSkew", "Losange noir : d\xE9calage de la pointe", -0.8, 0.8, 0.05],
      ["socketTips", "Losange noir : pointes aux coins", 0, 8, 0.25],
      ["ringR", "Anneau vert : taille", 3, 9, 0.1],
      ["ringWidth", "Anneau vert : \xE9paisseur", 0.2, 2.5, 0.05],
      ["iris", "Iris bleu : taille", 0.3, 0.95, 0.01],
      ["glint", "Pupille blanche : taille", 0, 0.6, 0.01]
    ]],
    ["T\xEAte", [
      ["hairGap", "Cheveux : \xE9cart au bandeau", -3, 8, 0.25],
      ["fringeLocks", "M\xE8ches devant le bandeau", 0, 16, 0.5],
      ["chinLength", "Longueur sous le bandeau", 8, 30, 0.5]
    ]],
    ["Cil", [
      ["lashLength", "Longueur", 0, 14, 0.5],
      ["lashWidth", "\xC9paisseur", 0.5, 5, 0.1],
      ["lashAngle", "Angle", -60, 60, 1]
    ]],
    ["Bouche", [
      ["mouthGap", "\xC9cart sous le bandeau", 0, 14, 0.25],
      ["mouthSize", "Taille", 0.5, 2, 0.05],
      ["mouthLine", "\xC9paisseur du trait", 0.2, 1.5, 0.05]
    ]],
    ["Corps dessin\xE9", [
      ["spriteBody", "Corps : trac\xE9 (0) / dessin\xE9 (1)", 0, 1, 1],
      ["faceScale", "Taille du visage sur le corps", 0.4, 2.5, 0.05],
      ["headScale", "Taille de la t\xEAte (avec les cheveux)", 0.8, 1.6, 0.01],
      ["faceX", "D\xE9calage gauche / droite", -20, 20, 0.5],
      ["faceY", "D\xE9calage haut / bas", -20, 20, 0.5],
      ["faceAngle", "Rotation du visage", -60, 60, 1],
      ["hairFront", "Cheveux devant le visage (0 / 1)", 0, 1, 1],
      ["skeleton", "Corps articul\xE9 (1) / images (0)", 0, 1, 1]
    ]],
    ["Pose de base (corps articul\xE9)", [
      ["p_torso", "Buste", -40, 40, 1],
      ["p_head", "T\xEAte", -45, 45, 1],
      ["p_hair", "Cheveux", -30, 30, 1],
      ["p_upperArmL", "Bras noir : \xE9paule", -150, 150, 1],
      ["p_forearmL", "Bras noir : coude", -150, 150, 1],
      ["p_handL", "Bras noir : main", -90, 90, 1],
      ["p_upperArmR", "Bras rose : \xE9paule", -150, 150, 1],
      ["p_forearmR", "Bras rose : coude", -150, 150, 1],
      ["p_handR", "Bras rose : main", -90, 90, 1],
      ["p_thighL", "Jambe gauche : hanche", -90, 90, 1],
      ["p_shinL", "Jambe gauche : genou", -120, 120, 1],
      ["p_footL", "Jambe gauche : pied", -60, 60, 1],
      ["p_thighR", "Jambe droite : hanche", -90, 90, 1],
      ["p_shinR", "Jambe droite : genou", -120, 120, 1],
      ["p_footR", "Jambe droite : pied", -60, 60, 1]
    ]],
    ["Couleurs", [
      ["maskColor", "Bandeau et anneaux"],
      ["irisColor", "Iris"],
      ["hairColor", "Cheveux"]
    ]]
  ];
  var SHOTS = [
    ["neutre", {}],
    ["parle", { mouthOpen: 0.7, mouthSmile: 0.45 }],
    ["plisse les yeux", { squint: 0.75, mouthSmile: 0.9, mouthOpen: 0.3 }],
    ["yeux ferm\xE9s", { blinkL: 1, blinkR: 1, mouthSmile: 0.5 }],
    ["regarde \xE0 droite", { gazeX: 0.9, gazeY: -0.2 }],
    ["surprise", { eyeWide: 1, mouthOpen: 0.6, mouthSmile: 0 }]
  ];
  var GESTURES = [
    ["repos", () => ({})],
    ["coucou", (t) => ({ armRRaise: 1, armRWave: Math.sin(t * 9), mouthSmile: 1, squint: 0.4 })],
    ["bras lev\xE9s", () => ({ armLRaise: 1, armRRaise: 1, mouthOpen: 0.5, mouthSmile: 1 })],
    ["r\xE9flexion", () => ({ armLRaise: 0.55, gazeX: -0.5, gazeY: -0.5, squint: 0.3, mouthSmile: 0 })],
    ["bras \xE9cart\xE9s", () => ({ armSpread: 1, mouthSmile: 0.85, mouthOpen: 0.25 })],
    ["pench\xE9e", () => ({ lean: 0.2, headRoll: 0.25, bodyRot: 0.05 })],
    ["jambes pli\xE9es", () => ({ thighL: 25, kneeL: 50, thighR: 25, kneeR: 50, foreL: 0.6, foreR: 0.6 })],
    ["parle", (t) => ({ mouthOpen: 0.35 + 0.35 * Math.sin(t * 13) * Math.sin(t * 3.1), mouthSmile: 0.5, headRoll: Math.sin(t * 2.3) * 0.05 })]
  ];
  var gesture = GESTURES[0];
  var rig = new Rig();
  var bodyCanvas = document.getElementById("body");
  var bctx = bodyCanvas.getContext("2d");
  function drawBody(now) {
    requestAnimationFrame(drawBody);
    const t = now / 1e3, dpr = window.devicePixelRatio || 1;
    const w = bodyCanvas.clientWidth, h = Math.round(w * 1.15);
    if (bodyCanvas.width !== Math.round(w * dpr)) {
      bodyCanvas.width = Math.round(w * dpr);
      bodyCanvas.height = Math.round(h * dpr);
      bodyCanvas.style.height = `${h}px`;
    }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.fillStyle = "#1b1922";
    bctx.fillRect(0, 0, w, h);
    const k = h * 0.95 / rig.frameH;
    const base = new Mat().translate(w / 2, h * 0.02).scale(k, k).translate(-rig.frameW / 2, 0);
    const blink = t % 4 < 0.15 ? 1 : 0;
    const p = { ...NEUTRAL, breathe: 0.5 + 0.5 * Math.sin(t * 1.6), hairWind: 0.25, blinkL: blink, blinkR: blink, ...gesture[1](t) };
    drawRigged(bctx, rig, base, 1, p, t, getFaceConfig());
  }
  function buildGestures() {
    const bar = document.getElementById("gestures");
    for (const g of GESTURES) {
      const b = document.createElement("button");
      b.textContent = g[0];
      b.onclick = () => {
        gesture = g;
        for (const x of bar.children) x.classList.toggle("on", x === b);
      };
      if (g === gesture) b.classList.add("on");
      bar.append(b);
    }
  }
  var canvas = document.getElementById("preview");
  var ctx = canvas.getContext("2d");
  var status = document.getElementById("status");
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const cols = 2, cell = Math.floor(canvas.clientWidth / cols);
    const rows = Math.ceil(SHOTS.length / cols);
    canvas.width = cols * cell * dpr;
    canvas.height = rows * cell * dpr;
    canvas.style.height = `${rows * cell}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = getFaceConfig().hairColor;
    ctx.fillRect(0, 0, cols * cell, rows * cell);
    const S = cell / 78;
    SHOTS.forEach(([name, p], i) => {
      const x = i % cols * cell, y = Math.floor(i / cols) * cell;
      drawFace(ctx, new Mat().translate(x + cell / 2, y + cell / 2 - cell * 0.06).scale(S), { ...NEUTRAL, ...p }, S);
      ctx.fillStyle = "#fff";
      ctx.font = "600 13px Segoe UI, sans-serif";
      ctx.fillText(name, x + 8, y + cell - 8);
    });
  }
  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    status.textContent = "modification\u2026";
    saveTimer = window.setTimeout(async () => {
      try {
        const r = await fetch("/api/face", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getFaceConfig()) });
        status.textContent = r.ok ? "enregistr\xE9, Capri est \xE0 jour" : "erreur d'enregistrement";
      } catch {
        status.textContent = "cerveau injoignable";
      }
    }, 250);
  }
  var inputs = /* @__PURE__ */ new Map();
  function buildForm() {
    const form = document.getElementById("controls");
    for (const [title, fields] of GROUPS) {
      const fs = document.createElement("fieldset");
      const lg = document.createElement("legend");
      lg.textContent = title;
      fs.append(lg);
      for (const f of fields) {
        const row = document.createElement("label");
        const name = document.createElement("span");
        name.textContent = f[1];
        const input = document.createElement("input");
        const out = document.createElement("output");
        if (f.length === 5) {
          const [key, , min, max, step] = f;
          Object.assign(input, { type: "range", min: String(min), max: String(max), step: String(step) });
          input.oninput = () => {
            setFaceConfig({ [key]: Number(input.value) });
            out.textContent = input.value;
            draw();
            save();
          };
          inputs.set(key, input);
          row.append(name, input, out);
        } else {
          const [key] = f;
          input.type = "color";
          input.oninput = () => {
            setFaceConfig({ [key]: input.value });
            draw();
            save();
          };
          inputs.set(key, input);
          row.append(name, input);
        }
        fs.append(row);
      }
      form.append(fs);
    }
  }
  function syncForm() {
    const c = getFaceConfig();
    for (const [key, input] of inputs) {
      input.value = String(c[key]);
      const out = input.nextElementSibling;
      if (out?.tagName === "OUTPUT") out.textContent = input.value;
    }
  }
  document.getElementById("reset").onclick = () => {
    setFaceConfig({ ...DEFAULT_FACE });
    syncForm();
    draw();
    save();
  };
  window.addEventListener("resize", draw);
  (async () => {
    buildForm();
    buildGestures();
    requestAnimationFrame(drawBody);
    try {
      setFaceConfig(await (await fetch("/api/face")).json());
    } catch {
    }
    syncForm();
    draw();
    status.textContent = "chaque r\xE9glage s'applique tout de suite \xE0 Capri";
  })();
})();
