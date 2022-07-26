const FFT = require('./fft.js');
const {
	pushDataOnBuffer,
	IIRfilter,
	averageArray,
	medianValue,
} = require('./general');
const {
	respHPCoefficients,
	respLPCoefficients,
} = require('./filter_coefficients');

// Respiration version 20210603

//---------------------------------------------- FILTERING ----------------------------------------------//
class Respiration {
	constructor() {
		// Respiration buffers
		this.FFT_RESP_ARRAY_SIZE = 4096;
		this.respDataFFT = new Array(this.FFT_RESP_ARRAY_SIZE).fill(0);
		this.respDataFFT2 = new Array(this.FFT_RESP_ARRAY_SIZE).fill(0);
		this.fft = new FFT(this.FFT_RESP_ARRAY_SIZE);

		// Filter
		this.RESP_FILTER_FEEDBACK_BUFFER_SIZE = 2;
		this.RESP_FILTER_BUFFER_SIZE = 3;
		this.respLpfFeedbackBuffer = new Array(
			this.RESP_FILTER_FEEDBACK_BUFFER_SIZE
		).fill(0);
		this.respLpfBuffer = new Array(this.RESP_FILTER_BUFFER_SIZE).fill(0);
		this.respLpfFeedbackBuffer2 = new Array(
			this.RESP_FILTER_FEEDBACK_BUFFER_SIZE
		).fill(0);
		this.respLpfBuffer2 = new Array(this.RESP_FILTER_BUFFER_SIZE).fill(0);
		this.respHpfFeedbackBuffer3 = new Array(
			this.RESP_FILTER_FEEDBACK_BUFFER_SIZE
		).fill(0);
		this.respHpfBuffer3 = new Array(this.RESP_FILTER_BUFFER_SIZE).fill(0);
		this.respLpfFeedbackBuffer3 = new Array(
			this.RESP_FILTER_FEEDBACK_BUFFER_SIZE
		).fill(0);
		this.respLpfBuffer3 = new Array(this.RESP_FILTER_BUFFER_SIZE).fill(0);

		// Time
		this.currentTime = 0;

		// Filters init
		this.respFilterBuffersInitialized = false;
		this.respBuffer3Init = false;

		// IIR low pass filter
		this.DC_FILTER_COEFFICIENT = 0.992;
		this.dcFilteredRespValue = 0;
		this.dcFilteredRespValueInit = 0;

		// Breath rate detection

		// Resp Signal
		this.currentRawValue = 0;
		this.lastRawValue = 0;
		this.respValueFilteredBuffer = new Array(5).fill(0);
		this.lastRespValueFiltered = new Array(3).fill(0);

		// Constrains
		this.MINIMUM_TIME_RESPIRATION = 183; // 141 resp/min Si no se recortase la señal. Entonces equivale a un valor de resp/min dependiente de la amplitud de la señal.
		this.MAXIMUM_TIME_RESPIRATION = 15000; // 2 resp/min

		// FSM
		this.fsmRespStatus = new Array(3).fill(0);
		this.INIT_LAST_RESP_VALUE = 0;
		this.SEARCHING_INITIAL_ZERO_TIME = 1;
		this.SEARCHING_FIRST_ZERO_TO_POSITIVE = 2;
		this.SEARCHING_FIRST_POSITIVE_TO_ZERO = 3;
		this.SEARCHING_NEXT_ZERO_TO_POSITIVE = 4;
		this.SEARCHING_NEXT_POSITIVE_TO_ZERO = 5;

		// Init time with zero value
		this.respInitZeroSignalTime = new Array(3).fill(0);

		// From zero to positive
		this.positiveZeroCrossBegginingTime = new Array(3).fill(0);
		this.positiveZeroCrossEndingTime = new Array(3).fill(0);
		this.nextMininumTimePositiveZeroCross = new Array(3).fill(0);

		// From positive to zero
		this.negativeZeroCrossBegginingTime = new Array(3).fill(0);
		this.negativeZeroCrossEndingTime = new Array(3).fill(0);
		this.nextMininumTimeNegativeZeroCross = new Array(3).fill(0);

		// Time positive to negative
		this.positiveToNegativeTime = new Array(3).fill(0);

		// Time in zero
		this.timeInZero = new Array(3).fill(0);

		// Respiratory rate
		this.computeRespiratoryRate = new Array(3).fill(0);
		this.positiveInstantRespiratoryRate = new Array(3).fill(0);
		this.negativeInstantRespiratoryRate = new Array(3).fill(0);

		// Median
		this.respirationRateMedianArray0 = new Array(5).fill(0);
		this.respirationRateMedianArray1 = new Array(5).fill(0);
		this.respirationRateMedianArray2 = new Array(5).fill(0);
		this.nRespirationRate = new Array(3).fill(0);
		this.respMedianValue = new Array(3).fill(0);
		this.respMedianValueLastUpdate = new Array(3).fill(0);

		// Rpm
		this.rpm = '-';
		this.tempRpm = '-';
		this.lastRpm = -1;
		this.respMedianRpmArray = new Array(5).fill(0);
		this.nRespMedianRPM = 0;

		this.timeWithoutNewRpmValue = 0;

		// FFT
		this.fftData = 0;
		this.tempFftData = 0;
		this.lastFftData = 5;
		this.fftDataCounter = 0;

		// Min and max values
		this.RESP_FILTER_MIN_VALUE_0 = 30;
		this.RESP_FILTER_MIN_VALUE_1 = 45; // 30
		this.RESP_FILTER_MIN_VALUE_2 = 80; // 70

		this.RESP_FILTER_INITIAL_MIN_VALUE = new Array(3);
		this.RESP_FILTER_INITIAL_MIN_VALUE[0] = this.RESP_FILTER_MIN_VALUE_0;
		this.RESP_FILTER_INITIAL_MIN_VALUE[1] = this.RESP_FILTER_MIN_VALUE_1;
		this.RESP_FILTER_INITIAL_MIN_VALUE[2] = this.RESP_FILTER_MIN_VALUE_2;

		this.respFilterMinValue = new Array(3);
		this.respFilterMinValue[0] = this.RESP_FILTER_INITIAL_MIN_VALUE[0];
		this.respFilterMinValue[1] = this.RESP_FILTER_INITIAL_MIN_VALUE[1];
		this.respFilterMinValue[2] = this.RESP_FILTER_INITIAL_MIN_VALUE[2];

		this.respMaxValue = new Array(3).fill(0);

		this.respFilterLastMinValue = new Array(3);
		this.respFilterLastMinValue[0] = this.RESP_FILTER_INITIAL_MIN_VALUE[0];
		this.respFilterLastMinValue[1] = this.RESP_FILTER_INITIAL_MIN_VALUE[1];
		this.respFilterLastMinValue[2] = this.RESP_FILTER_INITIAL_MIN_VALUE[2];
		this.respFilterNewMinValue = new Array(3).fill(0);
		this.respFilterNewMinValue[0] = this.RESP_FILTER_INITIAL_MIN_VALUE[0];
		this.respFilterNewMinValue[1] = this.RESP_FILTER_INITIAL_MIN_VALUE[1];
		this.respFilterNewMinValue[2] = this.RESP_FILTER_INITIAL_MIN_VALUE[2];
		this.respFilterMinValueLastUpdate = new Array(3).fill(0);

		// Reset variables if no new RPM is issued in a time
		this.noNewRPMValueLastResetTime = 0;
		this.signalMinValueNotReachedCounter = new Array(3).fill(0);

		this.newRespMedianValue = 0;

		this.highRPMCounter = 0;
	}

	computeRespFFT() {
		pushDataOnBuffer(this.respDataFFT, this.respValueFilteredBuffer[3]);
		pushDataOnBuffer(this.respDataFFT2, this.respValueFilteredBuffer[4]);

		if (this.currentTime % 1000 == 0) {
			let tempFFT = this.spectralRespRateEstimation();

			if (tempFFT > 4) {
				if (Math.abs(tempFFT - this.lastFftData) < 2) {
					this.fftDataCounter++;
					if (this.fftDataCounter > 2) {
						this.fftData = tempFFT;
					}
				} else {
					this.fftDataCounter = 0;
				}
				this.lastFftData = tempFFT;
			}
			//console.log("fftData = " + this.fftData)
		}
	}

	respFilterMinValueChecker() {
		for (let i = 0; i < 3; i++) {
			let timeWithoutUpdate =
				this.currentTime - this.respFilterMinValueLastUpdate[i];
			//console.log("RESP timeWithoutUpdate[" + i + "] = " + timeWithoutUpdate)
			if (timeWithoutUpdate > 12000) {
				this.respFilterMinValueLastUpdate[i] = this.currentTime;
				this.respFilterMinValue[i] = this.RESP_FILTER_INITIAL_MIN_VALUE[i];
				this.respFilterNewMinValue[i] = this.RESP_FILTER_INITIAL_MIN_VALUE[i];
				this.respFilterLastMinValue[i] = this.RESP_FILTER_INITIAL_MIN_VALUE[i];
				//console.log("RESET RESP_FILTER_MIN_VALUE[" + i + "] = " + timeWithoutUpdate);
			}
		}
	}

	resetRespirationVariables(i) {
		this.respInitZeroSignalTime[i] = 0;
		this.nextMininumTimePositiveZeroCross[i] = 0;
		this.nextMininumTimeNegativeZeroCross[i] = 0;
		this.positiveToNegativeTime[i] = 0;
		this.positiveZeroCrossBegginingTime[i] = 0;
		this.positiveZeroCrossEndingTime[i] = 0;
		this.negativeZeroCrossBegginingTime[i] = 0;
		this.negativeZeroCrossEndingTime[i] = 0;
		this.computeRespiratoryRate[i] = 0;
		this.positiveInstantRespiratoryRate[i] = 0;
		this.negativeInstantRespiratoryRate[i] = 0;
	}

	checkRespMax(i) {
		if (this.respValueFilteredBuffer[i] < 10000) {
			if (this.respValueFilteredBuffer[i] > this.respMaxValue[i]) {
				this.respMaxValue[i] = this.respValueFilteredBuffer[i];
			}
		}
	}

	computeRespirationRate() {
		for (let i = 0; i < 3; i++) {
			switch (this.fsmRespStatus[i]) {
				case this.INIT_LAST_RESP_VALUE:
					this.fsmRespStatus[i] = this.SEARCHING_INITIAL_ZERO_TIME;
					// Reset variables
					this.respInitZeroSignalTime[i] = 0;
					break;

				case this.SEARCHING_INITIAL_ZERO_TIME:
					if (
						this.respValueFilteredBuffer[i] == 0 &&
						this.lastRespValueFiltered[i] == 0
					) {
						this.respInitZeroSignalTime[i] += 8;

						if (
							this.respInitZeroSignalTime[i] > this.MINIMUM_TIME_RESPIRATION
						) {
							this.respInitZeroSignalTime[i] = 0;
							this.fsmRespStatus[i] = this.SEARCHING_FIRST_ZERO_TO_POSITIVE;
							// Reset variables
						}
					} else {
						this.respInitZeroSignalTime[i] = 0;
					}
					break;

				case this.SEARCHING_FIRST_ZERO_TO_POSITIVE:
					// Cruce por cero, de cero a positivo
					if (
						this.respValueFilteredBuffer[i] > 0 &&
						this.lastRespValueFiltered[i] == 0
					) {
						this.positiveZeroCrossBegginingTime[i] = this.currentTime;
						this.nextMininumTimePositiveZeroCross[i] =
							this.positiveZeroCrossBegginingTime[i] +
							this.MINIMUM_TIME_RESPIRATION;

						this.fsmRespStatus[i] = this.SEARCHING_FIRST_POSITIVE_TO_ZERO;
					}
					// Si está buscando más de 30 segundos indicar algo
					break;

				case this.SEARCHING_FIRST_POSITIVE_TO_ZERO:
					// Cruce por cero, de positivo a cero
					if (
						this.respValueFilteredBuffer[i] == 0 &&
						this.lastRespValueFiltered[i] > 0
					) {
						this.positiveToNegativeTime[i] =
							this.currentTime - this.positiveZeroCrossBegginingTime[i];

						// Si el tiempo entre el flanco de subida y el de bajada está en el rango
						if (
							this.positiveToNegativeTime[i] > this.MINIMUM_TIME_RESPIRATION &&
							this.positiveToNegativeTime[i] < this.MAXIMUM_TIME_RESPIRATION
						) {
							this.negativeZeroCrossBegginingTime[i] = this.currentTime;
							this.nextMininumTimeNegativeZeroCross[i] =
								this.negativeZeroCrossBegginingTime[i] +
								this.MINIMUM_TIME_RESPIRATION;

							this.fsmRespStatus[i] = this.SEARCHING_NEXT_ZERO_TO_POSITIVE;
						}
						// Si no está en el rango, se vuelve a buscar un tiempo en cero
						else {
							this.fsmRespStatus[i] = this.SEARCHING_INITIAL_ZERO_TIME;
							//console.log("positiveToNegativeTime RESET ["+ i + "] = " + this.positiveToNegativeTime[i]);
							// Reset variables
							this.resetRespirationVariables(i);
						}
					}
					break;

				case this.SEARCHING_NEXT_ZERO_TO_POSITIVE:
					if (this.currentTime > this.nextMininumTimePositiveZeroCross[i]) {
						// Cruce por cero, de cero a positivo
						if (
							this.respValueFilteredBuffer[i] > 0 &&
							this.lastRespValueFiltered[i] == 0
						) {
							if (this.computeRespiratoryRate[i] == 1) {
								this.timeInZero[i] =
									this.currentTime - this.negativeZeroCrossBegginingTime[i];

								if (
									this.positiveInstantRespiratoryRate[i] <
										this.negativeInstantRespiratoryRate[i] * 1.2 &&
									this.positiveInstantRespiratoryRate[i] >
										this.negativeInstantRespiratoryRate[i] * 0.8
								) {
									let averagePositiveNegativeRate =
										(this.positiveInstantRespiratoryRate[i] +
											this.negativeInstantRespiratoryRate[i]) /
										2;
									//console.log("averagePositiveNegativeRate[" + i + "] = " + averagePositiveNegativeRate)

									if (
										averagePositiveNegativeRate > 2 &&
										averagePositiveNegativeRate < 170
									) {
										// Nuevo mediana
										if (i == 0) {
											pushDataOnBuffer(
												this.respirationRateMedianArray0,
												averagePositiveNegativeRate
											);
										} else if (i == 1) {
											pushDataOnBuffer(
												this.respirationRateMedianArray1,
												averagePositiveNegativeRate
											);
										} else if (i == 2) {
											pushDataOnBuffer(
												this.respirationRateMedianArray2,
												averagePositiveNegativeRate
											);
										}

										if (this.nRespirationRate[i] > 1) {
											// 2
											if (i == 0) {
												this.respMedianValue[i] = medianValue(
													this.respirationRateMedianArray0
												);
											} else if (i == 1) {
												this.respMedianValue[i] = medianValue(
													this.respirationRateMedianArray1
												);
											} else if (i == 2) {
												this.respMedianValue[i] = medianValue(
													this.respirationRateMedianArray2
												);
											}
											//console.log("NEW RPM[" + i + "] = " + this.respMedianValue[i])
											//console.log(this.respirationRateMedianArray0)
											//console.log(this.respirationRateMedianArray1)
											//console.log(this.respirationRateMedianArray2)
										} else {
											this.nRespirationRate[i]++;
											this.respMedianValue[i] = averagePositiveNegativeRate;
											//console.log("ANTES DE M, NEW RPM[" + i + "] = " + this.respMedianValue[i])
										}
										this.newRespMedianValue = 1;
										this.respMedianValueLastUpdate[i] = this.currentTime;
										//console.log("nRespirationRate[" + i + "] = " + this.nRespirationRate[i])
									}
								}
								//else
								//{
								//	console.log("respRate no match["+ i +"] = " + this.positiveInstantRespiratoryRate[i] + " , " + this.negativeInstantRespiratoryRate[i])
								//}
							} else {
								this.timeInZero[i] =
									this.currentTime - this.negativeZeroCrossBegginingTime[i];
							}

							// Si el tiempo entre el primer flanco de bajada y el segundo de subida está en el rango
							if (
								this.timeInZero[i] > this.MINIMUM_TIME_RESPIRATION &&
								this.timeInZero[i] < this.MAXIMUM_TIME_RESPIRATION
							) {
								this.positiveZeroCrossEndingTime[i] = this.currentTime;
								this.positiveInstantRespiratoryRate[i] =
									60000 /
									(this.positiveZeroCrossEndingTime[i] -
										this.positiveZeroCrossBegginingTime[i]);

								this.positiveZeroCrossBegginingTime[i] = this.currentTime;
								this.nextMininumTimePositiveZeroCross[i] =
									this.positiveZeroCrossBegginingTime[i] +
									this.MINIMUM_TIME_RESPIRATION;

								this.fsmRespStatus[i] = this.SEARCHING_NEXT_POSITIVE_TO_ZERO;
							}
							// Si no está en el rango, se vuelve a buscar un tiempo en cero
							else {
								//console.log("RESET SEARCHING_NEXT_ZERO_TO_POSITIVE["+i+"]")
								this.fsmRespStatus[i] = this.SEARCHING_INITIAL_ZERO_TIME;
								// Reset variables
								this.resetRespirationVariables(i);
							}
						}
					}
					break;

				case this.SEARCHING_NEXT_POSITIVE_TO_ZERO:
					if (this.currentTime > this.nextMininumTimeNegativeZeroCross[i]) {
						this.checkRespMax(i);
						// FIN DE PRUEBA
						// Cruce por cero, de positivo a cero
						if (
							this.respValueFilteredBuffer[i] == 0 &&
							this.lastRespValueFiltered[i] > 0
						) {
							this.positiveToNegativeTime[i] =
								this.currentTime - this.positiveZeroCrossEndingTime[i];

							// Si el tiempo entre el flanco de subida y el de bajada está en el rango
							if (
								this.positiveToNegativeTime[i] >
									this.MINIMUM_TIME_RESPIRATION &&
								this.positiveToNegativeTime[i] < this.MAXIMUM_TIME_RESPIRATION
							) {
								this.respFilterLastMinValue[i] = this.respFilterMinValue[i];
								this.respFilterNewMinValue[i] = this.respMaxValue[i] * 0.2;
								if (
									this.respFilterNewMinValue[i] <
									this.RESP_FILTER_INITIAL_MIN_VALUE[i]
								) {
									this.respFilterNewMinValue[i] =
										this.RESP_FILTER_INITIAL_MIN_VALUE[i];
								}
								this.respFilterMinValueLastUpdate[i] = this.currentTime;
								//console.log("respFilterMinValueLastUpdate ACTUALIZADO")

								this.respMaxValue[i] = this.RESP_FILTER_INITIAL_MIN_VALUE[i];
								this.negativeZeroCrossEndingTime[i] = this.currentTime;
								this.negativeInstantRespiratoryRate[i] =
									60000 /
									(this.negativeZeroCrossEndingTime[i] -
										this.negativeZeroCrossBegginingTime[i]);
								this.negativeZeroCrossBegginingTime[i] = this.currentTime;
								this.nextMininumTimeNegativeZeroCross[i] =
									this.negativeZeroCrossBegginingTime[i] +
									this.MINIMUM_TIME_RESPIRATION;

								this.computeRespiratoryRate[i] = 1;

								this.fsmRespStatus[i] = this.SEARCHING_NEXT_ZERO_TO_POSITIVE;
							}
							// Si no está en el rango, se vuelve a buscar un tiempo en cero
							else {
								//console.log("RESET SEARCHING_NEXT_POSITIVE_TO_ZERO["+i+"]")
								this.fsmRespStatus[i] = this.SEARCHING_INITIAL_ZERO_TIME;
								// Reset variables
								this.resetRespirationVariables(i);
							}
						}
					}
					break;
			}

			this.lastRespValueFiltered[i] = this.respValueFilteredBuffer[i];
		}
	}

	determineRPMValue() {
		let notAddNewRPM = 0;
		//hacer esto sólo cuando haya un valor nuevo
		if (this.newRespMedianValue) {
			//if ((this.currentTime % 1000) == 0)
			this.newRespMedianValue = 0;
			let diffMedian10 = Math.abs(
				this.respMedianValue[1] - this.respMedianValue[0]
			);
			let diffMedian12 = Math.abs(
				this.respMedianValue[1] - this.respMedianValue[2]
			);
			let diffMedian02 = Math.abs(
				this.respMedianValue[0] - this.respMedianValue[2]
			);
			let diffMedian0Fft = Math.abs(this.respMedianValue[0] - this.fftData);
			let diffMedian2Fft = Math.abs(this.respMedianValue[2] - this.fftData);

			//console.log("[0] = " + this.respMedianValue[0])
			//console.log("[1] = " + this.respMedianValue[1])
			//console.log("[2] = " + this.respMedianValue[2])
			//console.log("FFT = " + this.fftData)

			if (diffMedian0Fft < 4 && this.respMedianValue[0] > 0) {
				this.tempRpm = Math.round(this.respMedianValue[0]);
				//console.log("1 = " + this.tempRpm)
			} else if (
				diffMedian10 < 4 &&
				diffMedian12 < 4 &&
				this.respMedianValue[1] > 0
			) {
				if (diffMedian10 < diffMedian12) {
					this.tempRpm = Math.round(this.respMedianValue[0]);
					//console.log("2 = " + this.tempRpm)
				} else {
					this.tempRpm = Math.round(this.respMedianValue[2]);
					//console.log("3 = " + this.tempRpm)
				}
			} else {
				if (diffMedian02 < 4 && this.respMedianValue[0] > 0) {
					this.tempRpm = Math.round(
						(this.respMedianValue[0] + this.respMedianValue[2]) / 2
					);
					//console.log("4 = " + this.tempRpm)
				} else if (diffMedian10 < 4 && this.respMedianValue[0] > 0) {
					this.tempRpm = Math.round(
						(this.respMedianValue[1] + this.respMedianValue[0]) / 2
					);
					//console.log("5 = " + this.tempRpm)
				} else if (
					diffMedian12 < 4 &&
					this.respFilterMinValue[2] > this.RESP_FILTER_INITIAL_MIN_VALUE[2] &&
					this.respMedianValue[1] > 0
				) {
					this.tempRpm = Math.round(
						(this.respMedianValue[1] + this.respMedianValue[2]) / 2
					);
					//console.log("6 = " + this.tempRpm)
				} else if (
					diffMedian12 < 4 &&
					diffMedian2Fft < 4 &&
					this.respMedianValue[1] > 0
				) {
					this.tempRpm = Math.round(
						(this.respMedianValue[1] + this.respMedianValue[2]) / 2
					);
					//console.log("7 = " + this.tempRpm)
				} else if (diffMedian12 < 4 && this.respMedianValue[1] > 0) {
					// NUEVO CASO. HAY QUE HACER UNA FFT CON VALORES ALTOS
					this.tempRpm = Math.round(
						(this.respMedianValue[1] + this.respMedianValue[2]) / 2
					);
					//console.log("8 = " + this.tempRpm)
				} else {
					this.tempRpm = this.lastRpm;
					//console.log("9 = " + this.tempRpm)
					notAddNewRPM = 1;
				}
			}

			//let diff = Math.abs(this.tempRpm - this.lastRpm)
			//console.log("diff = " + diff)

			this.lastRpm = this.tempRpm;

			// No hay valor aún

			if (this.tempRpm < 3) {
				//3
				this.rpm = '-';
			} else if (!notAddNewRPM) {
				// HOY el !notAddNewRPM
				if (this.tempRpm > 30) {
					if (this.highRPMCounter < 4) {
						this.highRPMCounter++;
					}
					//console.log("highRPMCounter = " + this.highRPMCounter)
				} else {
					this.highRPMCounter = 0;
				}

				if (this.tempRpm <= 30 || this.highRPMCounter >= 4) {
					//console.log("se mete = " + this.nRespMedianRPM)
					pushDataOnBuffer(this.respMedianRpmArray, this.tempRpm);

					// Nuevo 26/01/2021

					if (this.nRespMedianRPM > 4) {
						//5 // 4
						let bigDiff = 0;
						for (let i = 0; i < this.respMedianRpmArray.length; i++) {
							let rpmToCompare = this.respMedianRpmArray[i];
							for (let u = 0; u < this.respMedianRpmArray.length; u++) {
								let diff = Math.abs(rpmToCompare - this.respMedianRpmArray[u]);
								if (diff >= 10) {
									bigDiff = 1;
									break;
								}
							}
						}

						if (bigDiff) {
							//console.log("BigDiff = " + bigDiff)
							this.rpm = Math.round(averageArray(this.respMedianRpmArray));
						} else {
							//console.log("BigDiff = " + bigDiff)
							this.rpm = medianValue(this.respMedianRpmArray);
						}

						//console.log("rpmCalculada = " + this.rpm)
						//console.log(this.respMedianRpmArray)
						//console.log("\n")
					} else {
						// Nuevo 26/01/2021
						this.rpm = this.tempRpm;
						//console.log("rpmTemprana = " + this.rpm)
						// Fin de nuevo
						this.nRespMedianRPM++;
					}
					// Fin de nuevo
				}
			}
		}
	}

	resetRespirationFilters() {
		//println("RESPIRATION FILTERS RESETED");
		this.respFilterBuffersInitialized = true;
		this.respBuffer3Init = false;
		// Reset DC filter values
		this.dcFilteredRespValue = 0;
		this.dcFilteredRespValueInit = 0;

		// Reset low pass filter values
		for (let k = 0; k < this.respLpfBuffer.length; k++) {
			this.respLpfBuffer[k] = 0;
			this.respLpfBuffer2[k] = 0;
			this.respLpfBuffer3[k] = 0;
		}

		for (let k = 0; k < this.respLpfFeedbackBuffer.length; k++) {
			this.respLpfFeedbackBuffer[k] = 0;
			this.respLpfFeedbackBuffer2[k] = 0;
			this.respLpfFeedbackBuffer3[k] = 0;
			this.respHpfFeedbackBuffer3[k] = 0;
		}
	}

	filterRespData(respRawValue) {
		let respValueHPFiltered = 0;
		let respValueHPFiltered3 = 0;
		let respValueHPLPFiltered = new Array(3).fill(0);

		let temp1 = 0;

		// Filter initialization
		if (this.dcFilteredRespValueInit == 2) {
			temp1 = this.DC_FILTER_COEFFICIENT * this.dcFilteredRespValue;
			this.dcFilteredRespValue = respRawValue - this.lastRawValue + temp1;
			respValueHPFiltered = this.dcFilteredRespValue;
		} else if (this.dcFilteredRespValueInit == 1) {
			this.dcFilteredRespValueInit = 2;
			this.dcFilteredRespValue = respRawValue - this.lastRawValue;
		} else {
			this.dcFilteredRespValueInit = 1;
		}
		this.lastRawValue = respRawValue;

		respValueHPFiltered = this.dcFilteredRespValue;

		// IIR Filtering
		if (this.dcFilteredRespValueInit == 2) {
			respValueHPLPFiltered[0] = IIRfilter(
				respValueHPFiltered,
				this.respLpfBuffer,
				this.respLpfFeedbackBuffer,
				respLPCoefficients[1]
			); // LPF 0.1 Hz
			respValueHPLPFiltered[1] = IIRfilter(
				respValueHPFiltered,
				this.respLpfBuffer2,
				this.respLpfFeedbackBuffer2,
				respLPCoefficients[14]
			); // LPF 1.4 Hz

			if (this.respBuffer3Init == false) {
				this.respBuffer3Init = true;
				for (let k = 0; k < this.respHpfBuffer3.length; k++) {
					this.respHpfBuffer3[k] = respValueHPFiltered;
				}
			}
			respValueHPFiltered3 = IIRfilter(
				respValueHPFiltered,
				this.respHpfBuffer3,
				this.respHpfFeedbackBuffer3,
				respHPCoefficients[6]
			); // HPF 0.9 Hz
			respValueHPLPFiltered[2] = IIRfilter(
				respValueHPFiltered3,
				this.respLpfBuffer3,
				this.respLpfFeedbackBuffer3,
				respLPCoefficients[14]
			); // LPF 1.6 Hz
		}

		// Min value filtering
		for (let i = 0; i < 3; i++) {
			// Update min values for each array if there are new values
			if (this.respFilterNewMinValue[i] != this.respFilterLastMinValue[i]) {
				if (respValueHPLPFiltered[i] < 0) {
					//console.log("\nrespFilterNewMinValue[0]  = " + this.respFilterNewMinValue[0])
					//console.log("respFilterLastMinValue[0] = " + this.respFilterLastMinValue[0])
					//console.log("respFilterMinValue["+i+"] = " + this.respFilterMinValue[i])
					this.respFilterMinValue[i] = this.respFilterNewMinValue[i];
					this.respFilterLastMinValue[i] = this.respFilterMinValue[i];
				}
			}

			// Set to 0 if value is lower than min value
			if (respValueHPLPFiltered[i] < this.respFilterMinValue[i]) {
				// 50
				respValueHPLPFiltered[i] = 0;
				this.signalMinValueNotReachedCounter[i]++;

				// Min value reset if has not been updated
				if (this.signalMinValueNotReachedCounter[i] > 3000) {
					// 24 segundos
					//console.log("NO RESP SIGNAL ["+i+"]")
					this.respFilterMinValue[i] = this.RESP_FILTER_INITIAL_MIN_VALUE[i];
					this.respFilterNewMinValue[i] = this.RESP_FILTER_INITIAL_MIN_VALUE[i];
					this.respFilterLastMinValue[i] =
						this.RESP_FILTER_INITIAL_MIN_VALUE[i];
					this.signalMinValueNotReachedCounter[i] = 0;
				}
			} else {
				this.signalMinValueNotReachedCounter[i] = 0;
			}
		}

		//console.log("R = " + respValueHPLPFiltered)

		this.respValueFilteredBuffer[0] = respValueHPLPFiltered[0];
		this.respValueFilteredBuffer[1] = respValueHPLPFiltered[1];
		this.respValueFilteredBuffer[2] = respValueHPLPFiltered[2];
		this.respValueFilteredBuffer[3] = respValueHPLPFiltered[0];
		this.respValueFilteredBuffer[4] = respValueHPLPFiltered[2];
	}

	spectralRespRateEstimation() {
		// Low Freq
		let maxMagLowFreq = 0;
		let posLowFreq = -1;
		let fftOutLowFreq = this.fft.createComplexArray();
		// High Freq
		let maxMagHighFreq = 0;
		let posHighFreq = -1;
		let fftOutHighFreq = this.fft.createComplexArray();

		let tempFftData = -1;

		this.fft.realTransform(fftOutLowFreq, this.respDataFFT);
		this.fft.realTransform(fftOutHighFreq, this.respDataFFT2);

		//console.log(this.out)

		for (let i = 4; i < 180; i += 2) {
			// Low frequency
			if (i < 100) {
				// 792 rpm
				let magnitudeLowFreq = Math.sqrt(
					fftOutLowFreq[i] * fftOutLowFreq[i] +
						fftOutLowFreq[i + 1] * fftOutLowFreq[i + 1]
				);
				if (magnitudeLowFreq > maxMagLowFreq) {
					maxMagLowFreq = magnitudeLowFreq;
					posLowFreq = i;
				}
			}
			// High frequency
			if (i > 18) {
				// 16 rpm
				let magnitudeHighFreq = Math.sqrt(
					fftOutHighFreq[i] * fftOutHighFreq[i] +
						fftOutHighFreq[i + 1] * fftOutHighFreq[i + 1]
				);
				if (magnitudeHighFreq > maxMagHighFreq) {
					maxMagHighFreq = magnitudeHighFreq;
					posHighFreq = i;
				}
			}
		}
		/*console.log("posLowFreq = " + posLowFreq * 0.9155273438)
		console.log("iLowFreq = " + posLowFreq)
		console.log("maxMagLowFreq = " + maxMagLowFreq)
		console.log("posHighFreq = " + posHighFreq * 0.9155273438)
		console.log("maxMagHighFreq = " + maxMagHighFreq)
		console.log("iHighFreq = " + posHighFreq)*/

		if (posLowFreq > 0 && posHighFreq > 0) {
			//console.log("LOS DOS")
			if (maxMagLowFreq > maxMagHighFreq) {
				if (maxMagLowFreq > 5000) {
					tempFftData = posLowFreq * 0.9155273438; // (125/4096) * 60
				}
				//else
				//{
				//	console.log("MAGNITUD PEQUEÑA")
				//}
			} else {
				if (maxMagHighFreq > 5000) {
					tempFftData = posHighFreq * 0.9155273438; // (125/4096) * 60
				}
				//else
				//{
				//	console.log("MAGNITUD PEQUEÑA 2")
				//}
			}
		} else if (posLowFreq > 0) {
			if (maxMagLowFreq > 5000) {
				//console.log("BAJO")
				tempFftData = posLowFreq * 0.9155273438; // (125/4096) * 60
			}
			//else
			//{
			//	console.log("MAGNITUD PEQUEÑA 3")
			//}
		} else if (posHighFreq > 0) {
			if (maxMagHighFreq > 5000) {
				//console.log("ALTO")
				tempFftData = posHighFreq * 0.9155273438; // (125/4096) * 60
			}
			//else
			//{
			//	console.log("MAGNITUD PEQUEÑA 4")
			//}
		}

		//console.log("tempFftData = " + tempFftData)
		return tempFftData;
	}

	resetFFTVariables() {
		for (let i = 0; i < this.respDataFFT.length; i++) {
			this.respDataFFT[i] = 0;
			this.respDataFFT2[i] = 0;
		}
		this.fftData = 0;
		this.tempFftData = 0;
		this.lastFftData = 5;
		this.fftDataCounter = 0;
		//console.log("RESET FFT")
	}
}
module.exports = Respiration;
