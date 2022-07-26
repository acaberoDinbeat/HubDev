const { IIRfilter, pushDataOnBuffer } = require('./general');

// Algorithms version 20210603
const logInFile = require('../debug_file');

class Algorithms {
	constructor() {
		this.Ecg = new (require('./Ecg'))();
		this.Respiration = new (require('./Respiration'))();
		this.samplingFrequency = 125;

		// Electrodes
		this.electrodesConnected = false;
		// Filters variables
		this.HPF = 1;
		this.LPF = 0;
		this.ecg_HPF_Fc = 0;
		this.ecg_LPF_Fc = 0;
		// Heart rate detection
		this.computeEcgHR_Enabled = true;
		this.timeWithoutComputingHREnabled = 0;
		// Breath rate detection
		this.computeRespRPM_Enabled = true;
		this.timeWithoutComputingRpmEnabled = 0;
		// ECG Signal
		this.showEcgSignal_Enabled = true;
		this.showEcgSignal_CoubleBeDisabled = false;
		this.showEcgSignal_Counter = 0;
		this.signalInRange = true;
		// Signal quality
		this.goodSignalCurrent = true;
		this.goodSignalLast = true;
		this.badToGoodSignalTransientTime = 0;

		// Respiration Synthesizer
		this.amplitude = 300;
		this.synthRate = 30;
		this.synthInc = (2 * Math.PI) / 125 / (60.0 / this.synthRate);
		this.synthValue = 0;
		this.synthAngle = 0;

		this.resetPlotEcg = 0;
		this.ecgRaws = [];
		this.ecgAfterFilter = [];
	}

	processEcgResp(
		ecgRawValue,
		respRawValue,
		electrodesConnected,
		typeOfFiltering = 1,
		ecg_HPF_Fc = 0.7,
		ecg_LPF_Fc = 30
	) {
		// this.ecgRaws.push(ecgRawValue)
		// this.ecgRaws.forEach( e => console.log(e))
		// console.log(this.ecgRaws);
		// logInFile(this.ecgRaws);

		//console.log("HR = " + oximeterBPM)
		// Dinbeat UNO current sample data
		this.Respiration.currentRawValue = respRawValue;
		this.Ecg.currentRawValue = ecgRawValue;
		this.electrodesConnected = electrodesConnected;

		// ECG Type of filter variables
		this.Ecg.typeOfPlotFiltering = typeOfFiltering;
		this.ecg_HPF_Fc = ecg_HPF_Fc;
		this.ecg_LPF_Fc = ecg_LPF_Fc;

		/////////////////// ECG ////////////////////

		// ECG Signal to voltage
		let ecgRawValueVoltage = ecgRawValue * this.Ecg.VOLTAGE_CONVERSION_CONSTANT;

		// ECG Real time type of filter changer
		this.changeOfEcgFilteringHandle(ecgRawValueVoltage);

		// Init ECG filter
		this.initECGFiltersHandle(ecgRawValueVoltage);

		// Filter ECG Data
		this.Ecg.filterEcgHRData(ecgRawValueVoltage);

		// Ecg Good signal checker
		this.checkGoodSignal();
		this.goodSignalHandler();

		// Compute ECG HR
		if (this.computeEcgHR_Enabled) {
			this.Ecg.transformEcgSignal();
			this.Ecg.computeHeartRate();
		}

		// To disabled showing ECG Signal
		this.showEcgSignalHandle();

		// Show ECG Signal
		if (this.showEcgSignal_Enabled) {
			if (this.resetPlotEcg > 0) {
				this.resetPlotEcg--;
				if (this.resetPlotEcg == 0) {
					//console.log("RESET 0")
					this.resetEcgPlotFilters(ecgRawValueVoltage);
				}
			}
			this.Ecg.filterEcgPlotData(ecgRawValueVoltage);
			if (this.Ecg.plotHPF_Fc >= 1.0) {
				this.Ecg.plotValueFiltered = -this.Ecg.plotValueFiltered;
			}
		} else {
			this.Ecg.plotValueFiltered = 0;
		}

		// Heart rate variability
		let hrv = this.Ecg.currentRRTime;
		//if (hrv > 0)
		//{
		//	console.log("HRV = " + hrv)
		//}

		/////////////////// RESPIRATION ////////////////////
		this.Respiration.currentTime += 8;

		// Respiration Synthesizer
		/*this.synthValue = this.amplitude * Math.sin(this.synthAngle)
		this.synthAngle += this.synthInc
		if (this.synthAngle > 6.3)
		{
			this.synthAngle = 0
		}
		respRawValue = Math.round(this.synthValue)*/
		// End of respiration synthesizer

		// NUEVO 17/02/2020
		this.Respiration.respFilterMinValueChecker();

		if (this.Respiration.respFilterBuffersInitialized == false) {
			this.Respiration.resetRespirationFilters();
			this.Respiration.resetRespirationVariables(0);
			this.Respiration.resetRespirationVariables(1);
			this.Respiration.resetRespirationVariables(2);
		}

		this.Respiration.filterRespData(respRawValue);

		if (this.computeRespRPM_Enabled) {
			this.Respiration.computeRespirationRate();

			this.Respiration.computeRespFFT();

			this.Respiration.determineRPMValue();
		}

		// FIN DE NUEVO

		//////////////////////////////////////// OTROS

		// Check if it's not computing HR
		this.noComputingEcgHRHandle();

		// Time without new HR value
		this.noNewHRValueHandle();

		// Check if it's not computing RPM
		this.noComputingRPMHandle();

		// Time without new RPM value
		this.noNewRPMValueHandle();

		let rpm = this.Respiration.rpm;

		// Update electrodes connected
		let electrodesConnectedStatus = this.updateElectrodesConnected();
		// Signal detected
		//let signalDetected = this.Ecg.signalMinValueReached

		let bpm = this.Ecg.bpm;

		// Prueba para meter el HR del oxímetro en el caso de que no lo hubiera de los electrodos.
		/*if (bpm === '-')
		{
			if (oximeterBPM > 0)
			{
				bpm = oximeterBPM
			}
		}*/

		// this.ecgAfterFilter.push(Number(this.Ecg.plotValueFiltered.toFixed(6)))
		// console.log(this.ecgAfterFilter);
		// logInFile(this.ecgAfterFilter);

		// console.log({filteredValue: this.Ecg.plotValueFiltered.toFixed(6)})
		//!!!!MEDIANTE EL toFixed ME QUEDO SOLO CON 6 DECIMALES DEL ECG:
		//return { ecgFiltered: Number(this.Ecg.plotValueFiltered.toFixed(6)), bpm: this.Ecg.bpm, rpm, hrv, electrodesConnectedStatus, signalDetected}
		return {
			ecgFiltered: Number(this.Ecg.plotValueFiltered.toFixed(6)),
			bpm,
			rpm,
			hrv,
			electrodesConnectedStatus,
		};
		//return { ecgFiltered: Number(this.Ecg.hrValueTransformed), bpm, rpm, hrv, electrodesConnectedStatus}
		//return { ecgFiltered: Number(this.Respiration.respValueFilteredBuffer[0]/500), bpm, rpm, hrv, electrodesConnectedStatus}
	}

	// Filters
	changeOfEcgFilteringHandle(ecgRawValueVoltage) {
		if (this.Ecg.typeOfPlotFiltering != this.Ecg.typeOfPlotFilteringLast) {
			//console.log("CAMBIO DE FILTRO = " + this.Ecg.typeOfPlotFiltering)
			this.resetEcgPlotFilters(ecgRawValueVoltage);
			this.initEcgPlotFilterCoefficients();
		}
		this.Ecg.typeOfPlotFilteringLast = this.Ecg.typeOfPlotFiltering;
	}

	initECGFiltersHandle(ecgRawValueVoltage) {
		if (this.Ecg.filterInitialized == 0) {
			this.initECGFilters(ecgRawValueVoltage);
		} else {
			// Waits one second to have the signal steady to compute signalIncrement, signalMax and signalMin
			if (this.Ecg.filterInitialized < 125) {
				this.Ecg.filterInitialized++;
			}
		}
	}

	computeBiquadFilterCoefficients(type, Fc, Fs, Q) {
		let a0 = 0;
		let a1 = 0;
		let a2 = 0;
		let b1 = 0;
		let b2 = 0;
		let norm = 0;

		let K = Math.tan((Math.PI * Fc) / Fs);
		switch (type) {
			// Low pass
			case 0:
				norm = 1 / (1 + K / Q + K * K);
				a0 = K * K * norm;
				a1 = 2 * a0;
				a2 = a0;
				b1 = 2 * (K * K - 1) * norm;
				b2 = (1 - K / Q + K * K) * norm;
				break;

			// High pass
			case 1:
				norm = 1 / (1 + K / Q + K * K);
				a0 = 1 * norm;
				a1 = -2 * a0;
				a2 = a0;
				b1 = 2 * (K * K - 1) * norm;
				b2 = (1 - K / Q + K * K) * norm;
				break;
		}

		let coeff = new Array(5).fill(0);

		coeff[0] = a0;
		coeff[1] = a1;
		coeff[2] = a2;
		coeff[3] = b1;
		coeff[4] = b2;

		return coeff;
	}

	setEcgPlot_FilterCoefficients(type) {
		switch (type) {
			case 0:
				this.Ecg.plotHPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.HPF,
						0.7,
						this.samplingFrequency,
						0.7071067812
					);
				this.Ecg.plotLPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.LPF,
						30,
						this.samplingFrequency,
						0.7071067812
					);
				this.Ecg.plotHPF_Fc = 0.7;
				this.Ecg.plotLPF_Fc = 30;
				break;
			// ECG_MONITOR_FILTER
			case 1:
				this.Ecg.plotHPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.HPF,
						0.7,
						this.samplingFrequency,
						0.7071067812
					); //1.5
				this.Ecg.plotLPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.LPF,
						30,
						this.samplingFrequency,
						0.7071067812
					); // 30
				this.Ecg.plotHPF_Fc = 0.7;
				this.Ecg.plotLPF_Fc = 30;
				break;
			// ECG_MOVEMENT_FILTER
			case 2:
				this.Ecg.plotHPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.HPF,
						8,
						this.samplingFrequency,
						0.7071067812
					); //10
				this.Ecg.plotLPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.LPF,
						20,
						this.samplingFrequency,
						0.7071067812
					); // 30
				this.Ecg.plotHPF_Fc = 8;
				this.Ecg.plotLPF_Fc = 20;
				break;
			// ECG_DIAGNOSTIC_FILTER
			case 3:
				this.Ecg.plotHPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.HPF,
						0.3,
						this.samplingFrequency,
						0.7071067812
					);
				this.Ecg.plotLPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.LPF,
						40,
						this.samplingFrequency,
						0.7071067812
					);
				this.Ecg.plotHPF_Fc = 0.15; // 0.4
				this.Ecg.plotLPF_Fc = 45;
				break;
			// ECG_CUSTOM_FILTER
			case 4:
				this.Ecg.plotHPF_Fc = this.ecg_HPF_Fc;
				this.Ecg.plotLPF_Fc = this.ecg_LPF_Fc;

				if (this.Ecg.plotHPF_Fc < 0.05) {
					this.Ecg.plotHPF_Fc = 0.05;
				} else if (this.Ecg.plotHPF_Fc > 5) {
					this.Ecg.plotHPF_Fc = 5;
				}

				if (this.Ecg.plotLPF_Fc < 15) {
					this.Ecg.plotLPF_Fc = 15;
				} else if (this.Ecg.plotLPF_Fc > this.samplingFrequency / 2.0) {
					this.Ecg.plotLPF_Fc = this.samplingFrequency / 2.0;
				}

				this.Ecg.plotHPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.HPF,
						this.Ecg.plotHPF_Fc,
						this.samplingFrequency,
						0.7071067812
					);
				this.Ecg.plotLPFFilterCoefficients =
					this.computeBiquadFilterCoefficients(
						this.LPF,
						this.Ecg.plotLPF_Fc,
						this.samplingFrequency,
						0.7071067812
					);
				break;
		}
	}

	initECGFilters(ecgRawValueVoltage) {
		//console.log("RESET FILTERS")
		this.Ecg.filterInitialized = 1;

		this.resetEcgHRFilters(ecgRawValueVoltage);
		this.resetEcgPlotFilters(ecgRawValueVoltage);

		// Compute filters coefficients
		// Heart rate signal filter coefficients
		this.initEcgHRFilterCoefficients();
		// ECG Plot signal filter coefficients
		this.initEcgPlotFilterCoefficients();
	}

	resetEcgHRFilters(ecgRawValueVoltage) {
		let k = 0;
		for (k = 0; k < this.Ecg.hrHPFBuffer.length; k++) {
			this.Ecg.hrHPFBuffer[k] = ecgRawValueVoltage;
			this.Ecg.hrLPFBuffer[k] = 0;
		}
		for (k = 0; k < this.Ecg.hrHPFFeedbackBuffer.length; k++) {
			this.Ecg.hrHPFFeedbackBuffer[k] = 0;
			this.Ecg.hrLPFFeedbackBuffer[k] = 0;
		}
	}

	resetEcgPlotFilters(ecgRawValueVoltage) {
		let k = 0;
		for (k = 0; k < this.Ecg.plotHPFBuffer.length; k++) {
			this.Ecg.plotHPFBuffer[k] = ecgRawValueVoltage;
			this.Ecg.plotLPFBuffer[k] = 0;
		}
		for (k = 0; k < this.Ecg.plotHPFFeedbackBuffer.length; k++) {
			this.Ecg.plotHPFFeedbackBuffer[k] = 0;
			this.Ecg.plotLPFFeedbackBuffer[k] = 0;
		}
	}

	initEcgHRFilterCoefficients() {
		this.Ecg.hrHPFFilterCoefficients = this.computeBiquadFilterCoefficients(
			this.HPF,
			8,
			this.samplingFrequency,
			0.7071067812
		); //0.5
		this.Ecg.hrLPFFilterCoefficients = this.computeBiquadFilterCoefficients(
			this.LPF,
			20,
			this.samplingFrequency,
			0.7071067812
		);
	}

	initEcgPlotFilterCoefficients() {
		this.setEcgPlot_FilterCoefficients(this.Ecg.typeOfPlotFiltering);
	}

	// Check Signal
	checkGoodSignal() {
		if (this.electrodesConnected) {
			this.checkSignalRange();
			if (this.signalInRange) {
				if (this.Ecg.filterInitialized == 125) {
					this.Ecg.checkSignalIncrement();
					if (!this.Ecg.sampleIncrementInRange) {
						this.resetPlotEcg = 16;
						//console.log("RESET 16")
						//this.resetEcgPlotFilters(this.Ecg.currentRawValue * this.Ecg.VOLTAGE_CONVERSION_CONSTANT)
					}
					if (this.Ecg.signalIncrementInRange) {
						this.Ecg.checkMinValue(this.Ecg.hrValueFiltered);
						if (this.Ecg.signalMinValueReached) {
							this.goodSignalCurrent = true;
						} else {
							//console.log("ECG SIGNAL BELOW MIN VALUE = " + + this.Ecg.nSamplesWithoutMinValue)
							this.goodSignalCurrent = false;
						}
					} else {
						//console.log("BAD INCREMENT")
						this.goodSignalCurrent = false;
						this.Ecg.signalIncrementInRange = true;
					}
				}
			} else {
				//console.log("SIGNAL IN RANGE FALSE. ecg = " + this.Ecg.currentRawValue + " resp = " + this.Respiration.currentRawValue)
				this.goodSignalCurrent = false;
			}
		} else {
			//console.log("ELECTRODOS OFF")
			this.goodSignalCurrent = false;
			this.Ecg.signalIncrementOutOfRangeCounter = 0;
		}
	}

	goodSignalHandler() {
		if (this.goodSignalCurrent && !this.goodSignalLast) {
			this.badToGoodSignalTransientTime = 625; // 5 segundos
			//console.log("CONECTADO, DESDE AHORA 5 S")
		}

		if (this.goodSignalCurrent) {
			//console.log("ECG GOOD SIGNAL CURRENT")
			if (this.badToGoodSignalTransientTime > 0) {
				this.badToGoodSignalTransientTime--;
				//console.log(this.badToGoodSignalTransientTime)
				if (this.badToGoodSignalTransientTime == 0) {
					this.Ecg.resetEcgHRVariables();
					this.computeEcgHR_Enabled = true;
					this.computeRespRPM_Enabled = true;
					//console.log("ECG AND RESP COMPUTE ENABLED")
				} else if (this.badToGoodSignalTransientTime == 500) {
					// 4 segundos
					this.showEcgSignal_Enabled = true;
					this.showEcgSignal_CoubleBeDisabled = false;
					this.showEcgSignal_Counter = 0;
					this.Ecg.filterInitialized = 0;
					this.Respiration.resetRespirationFilters();
					//console.log("ECG AND RESP - RESET 500")
				}
			} else if (this.badToGoodSignalTransientTime == 0) {
				this.computeEcgHR_Enabled = true;
				this.computeRespRPM_Enabled = true;
				this.showEcgSignal_Enabled = true;
			}
		} else {
			//console.log("BAD SIGNAL")
			if (this.goodSignalLast) {
				this.Ecg.filterInitialized = 0;
				this.Ecg.hrValueTransformed = 0;
			}
			this.computeEcgHR_Enabled = false;
			this.showEcgSignal_CoubleBeDisabled = true;
			//this.showEcgSignal_Enabled = false
			this.computeRespRPM_Enabled = false;
		}

		this.goodSignalLast = this.goodSignalCurrent;
	}

	checkSignalRange() {
		if (
			this.Ecg.currentRawValue >= 8388607 ||
			this.Ecg.currentRawValue <= -8388608 ||
			this.Respiration.currentRawValue >= 8388607 ||
			this.Respiration.currentRawValue <= -8388608
		) {
			this.signalInRange = false;
		} else {
			this.signalInRange = true;
		}
	}

	// Show ECG signal
	showEcgSignalHandle() {
		if (this.showEcgSignal_CoubleBeDisabled) {
			if (this.showEcgSignal_Counter == 15000) {
				// 120 s
				this.showEcgSignal_Enabled = false;
			} else {
				this.showEcgSignal_Counter++;
			}
		} else {
			this.showEcgSignal_Counter = 0;
		}
	}

	// Send HR handles
	noComputingEcgHRHandle() {
		if (!this.computeEcgHR_Enabled) {
			//console.log("TIEMPO SIN HR = " + this.timeWithoutComputingHREnabled)
			if (this.timeWithoutComputingHREnabled >= 15000) {
				// 120 s
				this.Ecg.bpm = '-';
			} else {
				this.timeWithoutComputingHREnabled++;
			}
		} else {
			this.timeWithoutComputingHREnabled = 0;
		}
	}

	noNewHRValueHandle() {
		if (!this.Ecg.newHrHasBeenComputed) {
			if (this.Ecg.timeWithoutNewHrValue >= 15000) {
				// 120 s
				this.Ecg.bpm = '-';
				//console.log("SE INVALIDA BPM")
			} else {
				this.Ecg.timeWithoutNewHrValue++;
				//console.log("TIME_WITHOUT_NEW_HR_VALUE = " + this.Ecg.timeWithoutNewHrValue)
			}
		} else {
			this.Ecg.newHrHasBeenComputed = false;
			this.Ecg.timeWithoutNewHrValue = 0;
		}
	}

	noComputingRPMHandle() {
		if (!this.computeRespRPM_Enabled) {
			if (this.timeWithoutComputingRpmEnabled >= 15000) {
				// 120 s
				this.Respiration.rpm = '-';
				//this.Respiration.respFilterBuffersInitialized = false
				//this.Respiration.timeWithoutComputingRpmEnabled = 0
				//this.Respiration.resetFFTVariables()
				//console.log("SE INVALIDA RPM")
			} else {
				this.timeWithoutComputingRpmEnabled++;
				//console.log("TIME_WITHOUT_RPM_ENABLED_VALUE = " + this.Respiration.timeWithoutComputingRpmEnabled)
			}
		} else {
			this.timeWithoutComputingRpmEnabled = 0;
		}
	}

	noNewRPMValueHandle() {
		let nWithoutUpdate = 0;
		for (let i = 0; i < 3; i++) {
			let timeWithoutNewValue =
				this.Respiration.currentTime -
				this.Respiration.respMedianValueLastUpdate[i];
			//console.log("timeWithoutNewValue[" + i + "] = " + timeWithoutNewValue)
			if (timeWithoutNewValue > 120000) {
				// 2 min
				//console.log("timeWithoutNewValue[" + i + "] = " + timeWithoutNewValue)
				this.Respiration.respMedianValue[i] = 0;
				nWithoutUpdate++;
			}
		}
		if (nWithoutUpdate > 1) {
			let lastResetTime =
				this.Respiration.currentTime -
				this.Respiration.noNewRPMValueLastResetTime;
			//console.log("lastResetTime = " + lastResetTime)
			if (lastResetTime > 300000) {
				// 5 min
				this.Respiration.noNewRPMValueLastResetTime =
					this.Respiration.currentTime;
				for (let i = 0; i < 3; i++) {
					this.Respiration.nRespirationRate[i] = 0;
					this.Respiration.respMedianValue[i] = 0;
					this.Respiration.respMedianValueLastUpdate[i] =
						this.Respiration.currentTime; // NUEVO
				}
				// Nuevo 26/01/2021
				this.Respiration.nRespMedianRPM = 0;
				// Fin de nuevo
				this.Respiration.respFilterBuffersInitialized = false;
				this.Respiration.resetFFTVariables();
				//console.log("RESETEA RESPIRACION")
			}

			this.Respiration.rpm = '-';
		}
	}

	// Electrodes connected
	updateElectrodesConnected() {
		let electrodesStatus = false;
		if (this.electrodesConnected) {
			if (this.signalInRange) {
				electrodesStatus = true;
			}
		}
		return electrodesStatus;
	}
}
module.exports = Algorithms;
