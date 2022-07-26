const {
	pushDataOnBuffer,
	IIRfilter,
	sumArray,
	averageArray,
	averageArrayElements,
} = require('./general');

// ECG version 20210603

class Ecg {
	constructor() {
		// ECG Constants
		this.VOLTAGE_CONVERSION_CONSTANT = 0.0000240405;
		this.ECG_FS = 125;
		//this.FINDING_MAXIMUM_WINDOW_SAMPLES = this.ECG_FS/5
		//this.FINDING_MAXIMUM_WINDOW_SAMPLES = this.ECG_FS * 0.12 // 15 samples
		this.FINDING_MAXIMUM_WINDOW_SAMPLES = this.ECG_FS * 0.16; // 20 samples
		this.N_BEATS_FOR_AVERAGE = 10;
		this.N_MAXIMUM_FOR_AVERAGE = 8;
		//this.Pth = ((0.7*this.ECG_FS)/128)+4.7
		this.Pth = (0.7 * this.ECG_FS) / 128 + 6.7; // 9.7
		this.Ts = 1.0 / this.ECG_FS;

		// R Peak detector FSM
		this.FINDING_MAXIMUM_VALUE_IN_A_WINDOW = 0;
		this.WAITING_FOR_RR_MIN_SAMPLES = 1;
		this.SEARCHING_VALUE_ABOVE_R_PEAK_THRESHOLD = 2;

		// Filter buffer
		this.FILTER_FEEDBACK_BUFFER_SIZE = 2;
		this.FILTER_BUFFER_SIZE = 3;
		this.plotHPFFeedbackBuffer = new Array(
			this.FILTER_FEEDBACK_BUFFER_SIZE
		).fill(0);
		this.plotHPFBuffer = new Array(this.FILTER_BUFFER_SIZE).fill(0);
		this.plotLPFFeedbackBuffer = new Array(
			this.FILTER_FEEDBACK_BUFFER_SIZE
		).fill(0);
		this.plotLPFBuffer = new Array(this.FILTER_BUFFER_SIZE).fill(0);

		this.hrHPFFeedbackBuffer = new Array(this.FILTER_FEEDBACK_BUFFER_SIZE).fill(
			0
		);
		this.hrHPFBuffer = new Array(this.FILTER_BUFFER_SIZE).fill(0);
		this.hrLPFFeedbackBuffer = new Array(this.FILTER_FEEDBACK_BUFFER_SIZE).fill(
			0
		);
		this.hrLPFBuffer = new Array(this.FILTER_BUFFER_SIZE).fill(0);

		// ECG signal
		this.hrPreviousValueFiltered = 0;
		this.hrValueFiltered = 0;
		this.hrValueTransformed = 0;
		this.hrDifferentialBuffer = new Array(3).fill(0);

		// ECG R peak detection and heart rate
		this.hrCurrentMaxValue = 0;
		this.hrCurrentMaxIndex = 0;
		this.hrRPeakDetectorStatus = 0;
		this.hrNSamplesElapsed = 0;
		this.hrInitialThresholdCounter = 0;
		this.MIN_THRESHOLD_COUNTER = 3;
		this.hrNBeatsForAverageCounter = 0;
		this.hrCurrentBeatSamples = 0;
		this.hrRPeakThreshold = 0;
		this.hrRPeakMinThreshold = 0;
		this.hrMaxValueArray = new Array(this.N_MAXIMUM_FOR_AVERAGE).fill(0);
		this.hrRRnSamplesArray = new Array(this.N_BEATS_FOR_AVERAGE).fill(0);
		this.bpm = '-';

		// Filter coefficients
		this.plotHPFFilterCoefficients = new Array(5).fill(0);
		this.plotLPFFilterCoefficients = new Array(5).fill(0);
		this.plotHPF_Fc = 0;
		this.plotLPF_Fc = 0;
		this.hrHPFFilterCoefficients = new Array(5).fill(0);
		this.hrLPFFilterCoefficients = new Array(5).fill(0);

		// ECG Plot
		this.plotValueFiltered = 0;

		// Init filters
		this.filterInitialized = 0;
		this.typeOfPlotFiltering = 0;
		this.typeOfPlotFilteringLast = 0;

		// Heart rate variability
		this.currentRRTime = -1;

		// Goog signal checker
		// Min value checker
		this.signalMinValueReached = true;
		this.nSamplesWithoutMinValue = 0;
		this.nSamplesWithMinValue = 0;

		// Raw values
		this.currentRawValue = 0;
		this.lastRawValue = 0;

		// Signal increment
		this.signalIncrementInitialized = false;
		this.signalIncrementInRange = true;

		// Timer
		this.timeToComputeHR = 625;

		// Time without new HR value
		this.newHrHasBeenComputed = false;
		this.timeWithoutNewHrValue = 0;

		// RR Time
		this.lastRRnSamples = 0;

		// Nuevo 21/05/2021
		this.signalIncrementOutOfRangeCounter = 0;
		this.signalIncrementNumberOfOutOfRangeIncrements = 0;
		this.sampleIncrementInRange = true;
	}

	resetEcgHRVariables() {
		this.hrPreviousValueFiltered = 0;
		this.hrValueFiltered = 0;
		this.hrValueTransformed = 0;
		for (let i = 0; i < this.hrDifferentialBuffer.length; i++) {
			this.hrDifferentialBuffer[i] = 0;
		}
		this.hrCurrentMaxValue = 0;
		this.hrCurrentMaxIndex = 0;
		this.hrRPeakDetectorStatus = 0;
		this.hrNSamplesElapsed = 0;
		this.hrInitialThresholdCounter = 0;
		this.hrNBeatsForAverageCounter = 0;
		this.hrCurrentBeatSamples = 0;
		this.hrRPeakThreshold = 0;
		this.hrRPeakMinThreshold = 0;
		for (let i = 0; i < this.hrMaxValueArray.length; i++) {
			this.hrMaxValueArray[i] = 0;
		}
		for (let i = 0; i < this.hrRRnSamplesArray.length; i++) {
			this.hrRRnSamplesArray[i] = 0;
		}
		// New
		this.timeToComputeHR = 625;
		this.lastRRnSamples = 0;
		// 21-05-2021
		this.signalIncrementOutOfRangeCounter = 0;
		this.signalIncrementNumberOfOutOfRangeIncrements = 0;
		this.signalIncrementInitialized = false;
		this.signalIncrementInRange = true;
		//console.log("RESET ECG HR VARIABLES!!!!!!!!!!!!")
	}

	//-------------------------------------------------- ECG SIGNAL CHECKER ---------------------------------------------//
	checkMinValue(ecgFilteredValue) {
		if (this.signalMinValueReached) {
			if (Math.abs(ecgFilteredValue) < 0.005) {
				this.nSamplesWithoutMinValue++;
				//console.log("MIN VALUE REACHED = " + this.nSamplesWithoutMinValue + ", " + ecgFilteredValue)
				if (this.nSamplesWithoutMinValue >= 625) {
					// 5 s
					this.nSamplesWithoutMinValue = 0;
					this.signalMinValueReached = false;
					//console.log("signalMinValueReached = false = " + this.nSamplesWithoutMinValue)
				}
			} else {
				//console.log("MIN VALUE REACHED = " + ecgFilteredValue + "samples = " + this.nSamplesWithoutMinValue)
				this.nSamplesWithoutMinValue = 0;
			}
		} else {
			if (Math.abs(ecgFilteredValue) < 0.005) {
				this.nSamplesWithoutMinValue++;
				//console.log("MIN VALUE NOT REACHED- = " + this.nSamplesWithoutMinValue)
				if (this.nSamplesWithoutMinValue >= 1875) {
					// 15 s
					this.nSamplesWithoutMinValue = 0;
					this.nSamplesWithMinValue = 0;
				}
			} else {
				this.nSamplesWithMinValue++;
				//console.log("MIN VALUE NOT REACHED+ = " + this.nSamplesWithoutMinValue)
				if (this.nSamplesWithMinValue >= 31) {
					// 0.25 s
					this.nSamplesWithoutMinValue = 0;
					this.nSamplesWithMinValue = 0;
					this.signalMinValueReached = true;
					//console.log("signalMinValueReached = true")
				}
			}
		}
	}

	checkSignalIncrement() {
		if (this.signalIncrementInitialized) {
			let diff = this.currentRawValue - this.lastRawValue;

			if (diff >= 32767 || diff <= -32768) {
				this.sampleIncrementInRange = false;
				//console.log("OUT")
			} else {
				this.sampleIncrementInRange = true;
			}

			if (this.signalIncrementOutOfRangeCounter == 0) {
				if (this.sampleIncrementInRange) {
					this.signalIncrementInRange = true;
				} else {
					this.signalIncrementOutOfRangeCounter = 1280;
					this.signalIncrementNumberOfOutOfRangeIncrements = 1;
					//console.log("DIFF = " + diff)
					//console.log("SE METE!")
				}
			} else {
				if (!this.sampleIncrementInRange) {
					this.signalIncrementNumberOfOutOfRangeIncrements++;
					//console.log("this.signalIncrementNumberOfOutOfRangeIncrements = " + this.signalIncrementNumberOfOutOfRangeIncrements + "/" + this.signalIncrementOutOfRangeCounter)
				}
				if (this.signalIncrementNumberOfOutOfRangeIncrements >= 256) {
					//console.log("\n\n\n\n MUY MALLLLLLLLLLLLLLLLLLLLLL!!!! \n\n\n\n")
					//console.log("diff = " + diff)
					this.signalIncrementOutOfRangeCounter = 0;
					this.signalIncrementNumberOfOutOfRangeIncrements = 0;
					this.signalIncrementInRange = false;
				} else {
					this.signalIncrementOutOfRangeCounter--;

					let signalIncrementNumberOfOutOfRangeIncrementsLeft =
						256 - this.signalIncrementNumberOfOutOfRangeIncrements;
					if (
						this.signalIncrementOutOfRangeCounter <
						signalIncrementNumberOfOutOfRangeIncrementsLeft
					) {
						this.signalIncrementOutOfRangeCounter = 0;
						//console.log("\n\n\n\n MENOR!!!! \n\n\n\n")
					}
					if (this.signalIncrementOutOfRangeCounter == 0) {
						this.signalIncrementNumberOfOutOfRangeIncrements = 0;
					}
				}
			}
		} else {
			this.signalIncrementInitialized = true;
		}
		this.lastRawValue = this.currentRawValue;
	}

	//-------------------------------------------------- FILTERING ECG --------------------------------------------------//
	filterEcgPlotData(ecgRawScaledValue) {
		let ecgValueHPFiltered = 0;
		let ecgValueHPLPFiltered = 0;

		ecgValueHPFiltered = IIRfilter(
			ecgRawScaledValue,
			this.plotHPFBuffer,
			this.plotHPFFeedbackBuffer,
			this.plotHPFFilterCoefficients
		); //funcion en otro archivo

		ecgValueHPLPFiltered = IIRfilter(
			ecgValueHPFiltered,
			this.plotLPFBuffer,
			this.plotLPFFeedbackBuffer,
			this.plotLPFFilterCoefficients
		); //funcion en otro archivo

		this.plotValueFiltered = ecgValueHPLPFiltered;
	}

	filterEcgHRData(ecgRawValue) {
		let ecgValueHPFiltered = 0;
		let ecgValueHPLPFiltered = 0;

		ecgValueHPFiltered = IIRfilter(
			ecgRawValue,
			this.hrHPFBuffer,
			this.hrHPFFeedbackBuffer,
			this.hrHPFFilterCoefficients
		); //funcion en otro archivo

		ecgValueHPLPFiltered = IIRfilter(
			ecgValueHPFiltered,
			this.hrLPFBuffer,
			this.hrLPFFeedbackBuffer,
			this.hrLPFFilterCoefficients
		); //funcion en otro archivo

		this.hrValueFiltered = ecgValueHPLPFiltered;
	}

	//-------------------------------------------------- TRANSFORMING ECG --------------------------------------------------//
	transformEcgSignal() {
		let ecgDifferential = this.hrValueFiltered - this.hrPreviousValueFiltered;
		//console.log("ecgDifferential = " + ecgDifferential)
		pushDataOnBuffer(this.hrDifferentialBuffer, ecgDifferential);
		let ecgCurrentMovingAverage = sumArray(this.hrDifferentialBuffer);
		//console.log("ecgCurrentMovingAverage = " + ecgCurrentMovingAverage)
		this.hrValueTransformed = Math.pow(ecgCurrentMovingAverage, 2); // Si se activa lo abs se quita esto.
		//console.log("Pow = " + this.hrValueTransformed )
		this.hrPreviousValueFiltered = this.hrValueFiltered;
	}
	//-------------------------------------------------- HEART RATE ----------------------------------------------//
	computeHeartRate() {
		// Reset RR Time
		this.currentRRTime = -1;

		switch (this.hrRPeakDetectorStatus) {
			case this.FINDING_MAXIMUM_VALUE_IN_A_WINDOW:
				if (this.hrValueTransformed > this.hrCurrentMaxValue) {
					this.hrCurrentMaxValue = this.hrValueTransformed;
					this.hrCurrentMaxIndex = this.hrNSamplesElapsed;
				}

				this.hrNSamplesElapsed++;
				if (this.hrNSamplesElapsed == this.FINDING_MAXIMUM_WINDOW_SAMPLES) {
					if (this.hrCurrentMaxValue > 15 || this.hrCurrentMaxValue < 0.0005) {
						//console.log("\nToo high Max value = " + this.hrCurrentMaxValue)
						this.hrNSamplesElapsed = 0;
						this.hrCurrentMaxValue = 0;
					} else {
						if (this.hrInitialThresholdCounter > this.MIN_THRESHOLD_COUNTER) {
							//3
							let currentRRnSamples =
								this.hrCurrentBeatSamples + this.hrCurrentMaxIndex;
							if (currentRRnSamples > 21 && currentRRnSamples < 1250) {
								// 21 = 357 bpm, 22 = 341 bpm, 23 = 326 bpm, 1249 = 6 bpm
								if (this.lastRRnSamples > 0) {
									//let RRSamplesDiff = currentRRnSamples - this.lastRRnSamples
									//console.log("diff = " + RRSamplesDiff)

									//if ((currentRRnSamples < (2.5 * this.lastRRnSamples)) && (currentRRnSamples > (0.4 * this.lastRRnSamples)))
									if (
										currentRRnSamples < 3 * this.lastRRnSamples &&
										currentRRnSamples > 0.3 * this.lastRRnSamples
									) {
										//console.log(currentRRnSamples)
										pushDataOnBuffer(this.hrRRnSamplesArray, currentRRnSamples);

										// HRV
										this.currentRRTime = (currentRRnSamples * 1000) / 125;

										if (
											this.hrNBeatsForAverageCounter < this.N_BEATS_FOR_AVERAGE
										) {
											this.hrNBeatsForAverageCounter++;
										}
									}
									//else
									//{
									//	console.log("Wrong sample!")
									//}
								}
								//console.log("\nthis.hrCurrentMaxValue = " + this.hrCurrentMaxValue)
								//console.log("current = " + currentRRnSamples)
								//console.log("last = " + this.lastRRnSamples)
								this.lastRRnSamples = currentRRnSamples;
							}
							//else
							//{
							//	console.log("DEMASIADO PEQUEÑO = " + currentRRnSamples)
							//}
						}

						if (this.hrInitialThresholdCounter < this.N_MAXIMUM_FOR_AVERAGE) {
							this.hrInitialThresholdCounter++;
						}

						// Compute new threshold
						pushDataOnBuffer(this.hrMaxValueArray, this.hrCurrentMaxValue);
						//console.log("\nthis.hrCurrentMaxValue = " + this.hrCurrentMaxValue)
						this.hrCurrentMaxValue = 0;
						this.hrRPeakThreshold = averageArrayElements(
							this.hrMaxValueArray,
							this.hrInitialThresholdCounter
						);
						this.hrRPeakMinThreshold = this.hrRPeakThreshold / 100;
						// RR times
						this.hrNSamplesElapsed = this.hrCurrentMaxIndex;
						this.hrCurrentBeatSamples =
							this.FINDING_MAXIMUM_WINDOW_SAMPLES - this.hrCurrentMaxIndex;
						this.hrRPeakDetectorStatus = this.WAITING_FOR_RR_MIN_SAMPLES;
					}
				}
				break;

			case this.WAITING_FOR_RR_MIN_SAMPLES:
				this.hrNSamplesElapsed--;
				this.hrCurrentBeatSamples++;
				if (this.hrNSamplesElapsed <= 0) {
					this.hrNSamplesElapsed = 0;
					this.hrRPeakDetectorStatus =
						this.SEARCHING_VALUE_ABOVE_R_PEAK_THRESHOLD;
					this.hrRPeakThreshold =
						this.hrRPeakThreshold * Math.pow(Math.E, -this.Pth * this.Ts);
				}
				break;

			case this.SEARCHING_VALUE_ABOVE_R_PEAK_THRESHOLD:
				this.hrRPeakThreshold =
					this.hrRPeakThreshold * Math.pow(Math.E, -this.Pth * this.Ts);
				if (this.hrRPeakThreshold < this.hrRPeakMinThreshold) {
					this.hrRPeakThreshold = this.hrRPeakMinThreshold;
				}
				if (this.hrValueTransformed > this.hrRPeakThreshold) {
					this.hrRPeakThreshold = 0;
					this.hrRPeakDetectorStatus = this.FINDING_MAXIMUM_VALUE_IN_A_WINDOW;
				}
				this.hrCurrentBeatSamples++;
				// Comprobador de número de samples máximo antes de resetear
				if (this.hrCurrentBeatSamples > 1250) {
					// 10 s
					//console.log("MAX NUM OF SAMPLES this.hrRPeakThreshold = " + this.hrRPeakThreshold)
					this.resetEcgHRVariables();
				}
				break;
		}

		//if (this.hrNBeatsForAverageCounter >= this.N_BEATS_FOR_AVERAGE)
		if (this.hrNBeatsForAverageCounter >= 6) {
			//
			//console.log("timeToComputeHR = " + this.timeToComputeHR)
			if (this.timeToComputeHR >= 625) {
				this.timeToComputeHR = 0;
				//let antes = averageArray(this.hrRRnSamplesArray)
				this.currentRRnSamplesAverage = averageArrayElements(
					this.hrRRnSamplesArray,
					this.hrNBeatsForAverageCounter
				);
				let tempBpm = Math.round(
					(this.ECG_FS / this.currentRRnSamplesAverage) * 60.0
				);
				if (tempBpm > 5 && tempBpm < 342) {
					this.bpm = tempBpm;
					this.newHrHasBeenComputed = true;
					//console.log("BPM = " + this.bpm)
				}
			} else {
				this.timeToComputeHR++;
			}
		}

		// Ordenando y quitando los valores de los extremos
		/*if (this.hrNBeatsForAverageCounter >= this.N_BEATS_FOR_AVERAGE)
		{
			//console.log("timeToComputeHR = " + this.timeToComputeHR)
			if (this.timeToComputeHR == 625)
			{
				this.timeToComputeHR  = 0
				// Prueba
				let data = this.hrRRnSamplesArray.slice()
				console.log("DATA = ")
				console.log(data)
				data.sort(function(a,b){return a - b;})
				console.log("SORT = ")
				console.log(data)
				// Fin de prueba
				let data2 = []
				for (let k = 0; k < (data.length-2); k++)
				{
					data2[k] = data[k+1]
					console
				} 
				console.log("DATA 2 = ")
				console.log(data2)
				// prueba
				let a = averageArray(this.hrRRnSamplesArray)
				let bpm2 = Math.round((this.ECG_FS/a)*60.0)
				console.log("BPM OLD = " + bpm2)
				// fin de prueba
				this.currentRRnSamplesAverage = averageArray(data2)
				let tempBpm = Math.round((this.ECG_FS/this.currentRRnSamplesAverage)*60.0)
				if ((tempBpm > 5) && (tempBpm < 342))
				{
					this.bpm = tempBpm
					this.newHrHasBeenComputed = true
					console.log("BPM = " + this.bpm)
					
				}
				else
				{
					console.log("BAD BPM = " + tempBpm)
				}		
			}
			else
			{
				this.timeToComputeHR++
			}
		}*/
	}
}
module.exports = Ecg;
