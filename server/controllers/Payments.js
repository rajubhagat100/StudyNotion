const { instance } = require("../config/razorpay")
const Course = require("../models/Course")
const User = require("../models/User")
const mailSender = require("../utils/mailSender")
const { courseEnrollmentEmail } = require("../mail/templates/courseEnrollmentEmail")
const { default: mongoose } = require("mongoose")
const { paymentSuccessEmail } = require("../mail/templates/paymentSuccessEmail")
const crypto = require("crypto")
const Razorpay = require("razorpay")
const generateInvoicePDF = require("../utils/generateInvoice")
const CourseProgress = require("../models/CourseProgress")

// -------------------- CAPTURE PAYMENT --------------------
exports.capturePayment = async (req, res) => {
  try {
    const { courses } = req.body   // ✅ now accept array of courses
    const uid = req.user.id

    if (!courses || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide course IDs",
      })
    }

    let totalAmount = 0

    // Validate all courses and check enrollment
    for (const courseId of courses) {
      const course = await Course.findById(courseId)
      if (!course) {
        return res.status(404).json({
          success: false,
          message: `Course not found: ${courseId}`,
        })
      }

      if (
        Array.isArray(course.studentsEnrolled) &&
        course.studentsEnrolled.includes(uid)
      ) {
        return res.status(400).json({
          success: false,
          message: `Already enrolled in course: ${course.courseName}`,
        })
      }

      totalAmount += course.price
    }

    // Create Razorpay order
    const amount = totalAmount * 100  // convert to paise
    const currency = "INR"

    const options = {
      amount,
      currency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        userId: uid.toString(),
        courses: JSON.stringify(courses),
      },
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY,
      key_secret: process.env.RAZORPAY_SECRET,
    })

    const order = await razorpay.orders.create(options)

    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      data: order,
    })
  } catch (error) {
    console.error("Error creating Razorpay order:", error.message)
    return res.status(500).json({
      success: false,
      message: "Could not initiate payment",
      error: error.message,
    })
  }
}

// -------------------- VERIFY PAYMENT --------------------
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courses } =
    req.body
  const userId = req.user.id

  if (
    !razorpay_order_id ||
    !razorpay_payment_id ||
    !razorpay_signature ||
    !courses ||
    !userId
  ) {
    return res.status(400).json({ success: false, message: "Payment Failed" })
  }

  let body = razorpay_order_id + "|" + razorpay_payment_id
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET)
    .update(body.toString())
    .digest("hex")

  if (expectedSignature === razorpay_signature) {
    // Enroll students
    await enrollStudents(courses, userId)
    return res.status(200).json({ success: true, message: "Payment Verified" })
  }

  return res.status(400).json({ success: false, message: "Payment Failed" })
}

// -------------------- ENROLL STUDENTS --------------------
const enrollStudents = async (courses, userId) => {
  if (!courses || !userId) {
    throw new Error("Please provide Course IDs and User ID")
  }

  for (const courseId of courses) {
    try {
      // Update Course
      const enrolledCourse = await Course.findOneAndUpdate(
        { _id: courseId },
        { $push: { studentsEnrolled: userId } },
        { new: true }
      )

      if (!enrolledCourse) {
        throw new Error("Course not found")
      }
      console.log("Updated course: ", enrolledCourse)

      // Create Course Progress
      const courseProgress = await CourseProgress.create({
        courseID: courseId,
        userId: userId,
        completedVideos: [],
      })

      // Update Student
      const enrolledStudent = await User.findByIdAndUpdate(
        userId,
        {
          $push: {
            courses: courseId,
            courseProgress: courseProgress._id,
          },
        },
        { new: true }
      )

      console.log("Enrolled student: ", enrolledStudent)

      // Send Email
      await mailSender(
        enrolledStudent.email,
        `Successfully Enrolled into ${enrolledCourse.courseName}`,
        courseEnrollmentEmail(
          enrolledCourse.courseName,
          `${enrolledStudent.firstName} ${enrolledStudent.lastName}`
        )
      )
    } catch (error) {
      console.error("Error enrolling student:", error.message)
    }
  }
}

// -------------------- SEND PAYMENT SUCCESS EMAIL --------------------
exports.sendPaymentSuccessEmail = async (req, res) => {
  const { orderId, paymentId, amount } = req.body
  const userId = req.user.id

  if (!orderId || !paymentId || !amount || !userId) {
    return res
      .status(400)
      .json({ success: false, message: "Please provide all the fields" })
  }

  try {
    const enrolledStudent = await User.findById(userId)

    const invoicePDF = await generateInvoicePDF(
      enrolledStudent.firstName,
      amount / 100, // convert paise → INR
      orderId,
      paymentId
    )

    await mailSender(
      enrolledStudent.email,
      `Payment Received`,
      paymentSuccessEmail(
        `${enrolledStudent.firstName}`,
        amount / 100,
        orderId,
        paymentId
      ),
      [
        {
          filename: `Invoice-${orderId}.pdf`,
          content: invoicePDF,
        },
      ]
    )

    return res.status(200).json({
      success: true,
      message: "Payment success email with invoice sent",
    })
  } catch (error) {
    console.log("Error in sending mail:", error.message)
    return res
      .status(500)
      .json({ success: false, message: "Could not send email" })
  }
}
