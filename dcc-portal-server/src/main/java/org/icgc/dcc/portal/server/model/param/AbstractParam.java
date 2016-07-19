/*
 * Copyright (c) 2016 The Ontario Institute for Cancer Research. All rights reserved.                             
 *                                                                                                               
 * This program and the accompanying materials are made available under the terms of the GNU Public License v3.0.
 * You should have received a copy of the GNU General Public License along with                                  
 * this program. If not, see <http://www.gnu.org/licenses/>.                                                     
 *                                                                                                               
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY                           
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES                          
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT                           
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,                                
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED                          
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;                               
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER                              
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN                         
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
package org.icgc.dcc.portal.server.model.param;

import javax.ws.rs.WebApplicationException;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import javax.ws.rs.core.Response.Status;

/**
 * An abstract base class from which to build Jersey parameter classes.
 *
 * @param <T> the type of value wrapped by the parameter
 */
public abstract class AbstractParam<T> {

  private final T value;

  /**
   * Given an input value from a client, creates a parameter wrapping its parsed value.
   *
   * @param input an input value from a client request
   */
  protected AbstractParam(String input) {
    try {
      this.value = parse(input);
    } catch (Exception e) {
      throw new WebApplicationException(error(input, e));
    }
  }

  /**
   * Given a string representation which was unable to be parsed and the exception thrown, produce a {@link Response} to
   * be sent to the client.
   *
   * By default, generates a {@code 400 Bad Request} with a plain text entity generated by
   * {@link #errorMessage(String, Exception)}.
   *
   * @param input the raw input value
   * @param e the exception thrown while parsing {@code input}
   * @return the {@link Response} to be sent to the client
   */
  protected Response error(String input, Exception e) {
    return Response.status(getErrorStatus())
        .entity(errorMessage(input, e))
        .type(mediaType())
        .build();
  }

  /**
   * Returns the media type of the error message entity.
   *
   * @return the media type of the error message entity
   */
  protected MediaType mediaType() {
    return MediaType.TEXT_PLAIN_TYPE;
  }

  /**
   * Given a string representation which was unable to be parsed and the exception thrown, produce an entity to be sent
   * to the client.
   *
   * @param input the raw input value
   * @param e the exception thrown while parsing {@code input}
   * @return the error message to be sent the client
   */
  protected String errorMessage(String input, Exception e) {
    return String.format("Invalid parameter: %s (%s)", input, e.getMessage());
  }

  /**
   * Given a string representation which was unable to be parsed, produce a {@link Status} for the {@link Response} to
   * be sent to the client.
   *
   * @return the HTTP {@link Status} of the error message
   */
  protected Status getErrorStatus() {
    return Status.BAD_REQUEST;
  }

  /**
   * Given a string representation, parse it and return an instance of the parameter type.
   *
   * @param input the raw input
   * @return {@code input}, parsed as an instance of {@code T}
   * @throws Exception if there is an error parsing the input
   */
  protected abstract T parse(String input) throws Exception;

  /**
   * Returns the underlying value.
   *
   * @return the underlying value
   */
  public T get() {
    return value;
  }

  @Override
  public boolean equals(Object obj) {
    if (this == obj) {
      return true;
    }
    if ((obj == null) || (getClass() != obj.getClass())) {
      return false;
    }
    final AbstractParam<?> that = (AbstractParam<?>) obj;
    return value.equals(that.value);
  }

  @Override
  public int hashCode() {
    return value.hashCode();
  }

  @Override
  public String toString() {
    return value.toString();
  }

}
